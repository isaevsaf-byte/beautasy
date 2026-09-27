// Raises the resolution of a small video with the machine-learning scaler
// built into macOS 26 (VideoToolbox's super-resolution frame processor).
//
// The first clips for the gallery came through Telegram at 464x848, which a
// phone screen stretches until the fabric turns to mush. This runs on the Mac
// itself: no upload, no credits, and it only sharpens what the camera saw — it
// does not invent a different piece of work.
//
// Build:  swiftc -O scripts/gallery/superres.swift -o /tmp/superres
// Run:    /tmp/superres in.mp4 out.mov [scale]
//
// The output is a high-bitrate HEVC file with no sound — an intermediate.
// scripts/gallery-import.mjs encodes the final file for the site and takes the
// sound from the original.

import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import VideoToolbox

struct Failure: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}

func log(_ message: String) {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

func makePool(_ attributes: [String: Any]) throws -> CVPixelBufferPool {
  var pool: CVPixelBufferPool?
  let status = CVPixelBufferPoolCreate(nil, nil, attributes as CFDictionary, &pool)
  guard status == kCVReturnSuccess, let pool else { throw Failure("pixel buffer pool: \(status)") }
  return pool
}

func buffer(from pool: CVPixelBufferPool) throws -> CVPixelBuffer {
  var buffer: CVPixelBuffer?
  let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
  guard status == kCVReturnSuccess, let buffer else { throw Failure("pixel buffer: \(status)") }
  return buffer
}

func run(input: URL, output: URL, scale: Int) async throws {
  guard VTSuperResolutionScalerConfiguration.isSupported else {
    throw Failure("this Mac has no super-resolution scaler")
  }
  // This Mac offers only 4x. The importer shrinks the result to the size the
  // site serves, so any factor at least as large as the one asked for will do.
  let factors = VTSuperResolutionScalerConfiguration.supportedScaleFactors
  guard let scale = factors.sorted().first(where: { $0 >= scale }) ?? factors.max() else {
    throw Failure("this Mac offers no scale factors")
  }

  let asset = AVURLAsset(url: input)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else {
    throw Failure("no video track in \(input.path)")
  }
  let (size, fps, transform) = try await track.load(.naturalSize, .nominalFrameRate, .preferredTransform)
  let width = Int(size.width)
  let height = Int(size.height)

  guard
    let config = VTSuperResolutionScalerConfiguration(
      frameWidth: width,
      frameHeight: height,
      scaleFactor: scale,
      inputType: .video,
      usePrecomputedFlow: false,
      qualityPrioritization: .normal,
      revision: VTSuperResolutionScalerConfiguration.defaultRevision
    )
  else { throw Failure("scaler refused \(width)x\(height) at \(scale)x") }

  if config.configurationModelStatus != .ready {
    log("fetching the scaler's model from Apple…")
    try await config.downloadConfigurationModel()
  }

  guard let pixelFormat = config.supportedPixelFormats.first else {
    throw Failure("scaler lists no pixel formats")
  }

  let processor = VTFrameProcessor()
  try processor.startSession(configuration: config)
  defer { processor.endSession() }

  // Frames straight from the decoder, in the format the scaler reads, and on
  // IOSurface-backed memory as VTFrameProcessorFrame requires
  let reader = try AVAssetReader(asset: asset)
  let readerOutput = AVAssetReaderTrackOutput(
    track: track,
    outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: pixelFormat,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
  )
  readerOutput.alwaysCopiesSampleData = false
  reader.add(readerOutput)

  var destination = config.destinationPixelBufferAttributes
  destination[kCVPixelBufferWidthKey as String] = width * scale
  destination[kCVPixelBufferHeightKey as String] = height * scale
  destination[kCVPixelBufferPixelFormatTypeKey as String] = pixelFormat
  destination[kCVPixelBufferIOSurfacePropertiesKey as String] = [String: Any]()
  let pool = try makePool(destination)

  try? FileManager.default.removeItem(at: output)
  let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
  // HEVC at a bitrate far above what the site serves: close enough to lossless
  // for an intermediate, and a tenth of the size ProRes would be at 4x
  let writerInput = AVAssetWriterInput(
    mediaType: .video,
    outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.hevc,
      AVVideoWidthKey: width * scale,
      AVVideoHeightKey: height * scale,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 60_000_000],
    ]
  )
  writerInput.expectsMediaDataInRealTime = false
  writerInput.transform = transform
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: writerInput, sourcePixelBufferAttributes: nil)
  writer.add(writerInput)

  guard reader.startReading() else { throw Failure("reader: \(String(describing: reader.error))") }
  guard writer.startWriting() else { throw Failure("writer: \(String(describing: writer.error))") }

  var previousSource: VTFrameProcessorFrame?
  var previousOutput: VTFrameProcessorFrame?
  var count = 0
  var started = false

  while let sample = readerOutput.copyNextSampleBuffer() {
    guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
    let time = CMSampleBufferGetPresentationTimeStamp(sample)
    if !started {
      writer.startSession(atSourceTime: time)
      started = true
    }

    let target = try buffer(from: pool)
    guard
      let source = VTFrameProcessorFrame(buffer: pixels, presentationTimeStamp: time),
      let result = VTFrameProcessorFrame(buffer: target, presentationTimeStamp: time),
      let parameters = VTSuperResolutionScalerParameters(
        sourceFrame: source,
        previousFrame: previousSource,
        previousOutputFrame: previousOutput,
        opticalFlow: nil,
        submissionMode: previousSource == nil ? .random : .sequential,
        destinationFrame: result
      )
    else { throw Failure("could not wrap frame \(count)") }

    _ = try await processor.process(parameters: parameters)

    while !writerInput.isReadyForMoreMediaData {
      try await Task.sleep(nanoseconds: 2_000_000)
    }
    guard adaptor.append(target, withPresentationTime: time) else {
      throw Failure("writer refused frame \(count): \(String(describing: writer.error))")
    }

    previousSource = source
    previousOutput = result
    count += 1
    if count % 60 == 0 { log("  \(count) frames") }
  }

  guard reader.status == .completed else { throw Failure("reader stopped: \(String(describing: reader.error))") }
  writerInput.markAsFinished()
  await writer.finishWriting()
  guard writer.status == .completed else { throw Failure("writer: \(String(describing: writer.error))") }
  log("\(count) frames at \(fps) fps: \(width)x\(height) → \(width * scale)x\(height * scale)")
}

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
  log("usage: superres <input> <output.mov> [scale]")
  exit(2)
}
do {
  try await run(
    input: URL(fileURLWithPath: arguments[1]),
    output: URL(fileURLWithPath: arguments[2]),
    scale: arguments.count > 3 ? Int(arguments[3]) ?? 2 : 2
  )
} catch {
  log("superres: \(error)")
  exit(1)
}
