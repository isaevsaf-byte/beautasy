// Lift one object out of a product photo, the way Photos does: transparent PNG,
// cropped to the object. Runs on the Mac (Vision), nothing is uploaded.
//
//   swift scripts/cutout.swift <in.jpg> <out.png> [instance]
//
// With several objects in the picture, the largest is taken unless an
// instance number (1, 2, …, in Vision's order) is given; the script prints
// each instance's size so you can choose.
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: swift scripts/cutout.swift <in> <out.png> [instance]"); exit(1) }
let url = URL(fileURLWithPath: args[1])
let handler = VNImageRequestHandler(url: url)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let result = request.results?.first else { print("no object found in \(args[1])"); exit(2) }

// Size of each instance, from its mask
var sizes: [(Int, Int)] = []
for i in result.allInstances {
  let m = try result.generateScaledMaskForImage(forInstances: IndexSet(integer: i), from: handler)
  CVPixelBufferLockBaseAddress(m, .readOnly)
  let w = CVPixelBufferGetWidth(m), h = CVPixelBufferGetHeight(m), row = CVPixelBufferGetBytesPerRow(m)
  let base = CVPixelBufferGetBaseAddress(m)!.assumingMemoryBound(to: Float32.self)
  var n = 0
  for y in stride(from: 0, to: h, by: 4) { for x in stride(from: 0, to: w, by: 4) { if base[y * row / 4 + x] > 0.5 { n += 1 } } }
  CVPixelBufferUnlockBaseAddress(m, .readOnly)
  sizes.append((i, n))
  print("instance \(i): \(n * 16) px")
}
let pick = args.count > 3 ? Int(args[3])! : sizes.max(by: { $0.1 < $1.1 })!.0
let cut = try result.generateMaskedImage(ofInstances: IndexSet(integer: pick), from: handler, croppedToInstancesExtent: true)
let ci = CIImage(cvPixelBuffer: cut)
let ctx = CIContext()
try ctx.writePNGRepresentation(of: ci, to: URL(fileURLWithPath: args[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("cut instance \(pick) → \(args[2]) (\(Int(ci.extent.width))×\(Int(ci.extent.height)))")
