// Draws one picture from a layout file: photos, colour bands, words, step numbers.
//
// Build:  swiftc -O video/scripts/pins/render.swift -o /tmp/pinrender
// Run:    /tmp/pinrender layout.json out.jpg|out.png
//
// Used for Pinterest Pins (1000x1500) and for the words laid over a Reel
// (1080x1920, transparent, saved as PNG). The layout's coordinates are from the
// top-left corner, as on a screen. Photos fill their box and are cropped to it
// (fx/fy move the crop, 0.5 is the middle); then the bands, then the words, then
// the numbered dots go on top, in that order.
import AppKit

struct Img: Decodable { let path: String; let x, y, w, h: Double; let r: Double?; let fx: Double?; let fy: Double? }
struct Txt: Decodable {
  let s: String; let font: String; let size: Double; let color: String; let y: Double
  let x: Double?; let w: Double?; let align: String?; let kern: Double?; let shadow: Bool?; let plate: String?
}
struct Badge: Decodable { let n: String; let x, y: Double }
struct Band: Decodable { let x, y, w, h: Double; let color: String; let r: Double? }
struct Spec: Decodable { let w, h: Double; let bg: String; let images: [Img]; let bands: [Band]?; let texts: [Txt]; let badges: [Badge]? }

/// "rrggbb" or "rrggbbaa"
func col(_ hex: String) -> NSColor {
  var v: UInt64 = 0
  Scanner(string: String(hex.prefix(6))).scanHexInt64(&v)
  let a = hex.count >= 8 ? Double(Int(hex.suffix(2), radix: 16)!) / 255 : 1
  return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: CGFloat(a))
}

let args = CommandLine.arguments
let spec = try! JSONDecoder().decode(Spec.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let W = spec.w, H = spec.h
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
ctx.imageInterpolation = .high
NSGraphicsContext.current = ctx
ctx.cgContext.clear(CGRect(x: 0, y: 0, width: W, height: H))
col(spec.bg).setFill()
NSRect(x: 0, y: 0, width: W, height: H).fill(using: .copy)
func flip(_ y: Double, _ h: Double) -> Double { H - y - h }

for im in spec.images {
  guard let src = NSImage(contentsOfFile: im.path), let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("missing \(im.path)\n".data(using: .utf8)!); exit(1)
  }
  let iw = Double(cg.width), ih = Double(cg.height)
  let scale = max(im.w / iw, im.h / ih)
  let cw = im.w / scale, ch = im.h / scale
  let crop = cg.cropping(to: CGRect(x: (iw - cw) * (im.fx ?? 0.5), y: (ih - ch) * (im.fy ?? 0.5), width: cw, height: ch))!
  NSGraphicsContext.saveGraphicsState()
  let rect = NSRect(x: im.x, y: flip(im.y, im.h), width: im.w, height: im.h)
  NSBezierPath(roundedRect: rect, xRadius: im.r ?? 0, yRadius: im.r ?? 0).addClip()
  ctx.cgContext.draw(crop, in: rect)
  NSGraphicsContext.restoreGraphicsState()
}
for b in spec.bands ?? [] {
  col(b.color).setFill()
  NSBezierPath(roundedRect: NSRect(x: b.x, y: flip(b.y, b.h), width: b.w, height: b.h), xRadius: b.r ?? 0, yRadius: b.r ?? 0).fill()
}
for t in spec.texts {
  let para = NSMutableParagraphStyle()
  para.alignment = t.align == "left" ? .left : (t.align == "right" ? .right : .center)
  para.lineHeightMultiple = 0.95
  let font = NSFont(name: t.font, size: t.size) ?? .systemFont(ofSize: t.size)
  var attr: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: col(t.color), .paragraphStyle: para, .kern: t.kern ?? 0]
  if t.shadow == true {
    let sh = NSShadow(); sh.shadowColor = NSColor(white: 0, alpha: 0.45); sh.shadowBlurRadius = 14; sh.shadowOffset = NSSize(width: 0, height: -2)
    attr[.shadow] = sh
  }
  let x = t.x ?? 40, w = t.w ?? (W - 80)
  let s = NSAttributedString(string: t.s, attributes: attr)
  let box = s.boundingRect(with: NSSize(width: w, height: 2000), options: [.usesLineFragmentOrigin])
  if let plate = t.plate {
    // A rounded plate just behind the words, sized to them, centred under them
    let used = s.boundingRect(with: NSSize(width: w, height: 2000), options: [.usesLineFragmentOrigin, .usesFontLeading]).size
    let padX = t.size * 0.45, padY = t.size * 0.22
    let pw = min(used.width, w) + padX * 2, ph = box.height + padY * 2
    let px = t.align == "left" ? x - padX : (t.align == "right" ? x + w - pw + padX : x + (w - pw) / 2)
    col(plate).setFill()
    NSBezierPath(roundedRect: NSRect(x: px, y: flip(t.y - padY, ph), width: pw, height: ph), xRadius: ph * 0.22, yRadius: ph * 0.22).fill()
  }
  s.draw(with: NSRect(x: x, y: flip(t.y, box.height), width: w, height: box.height), options: [.usesLineFragmentOrigin])
}
for b in spec.badges ?? [] {
  let r = NSRect(x: b.x, y: flip(b.y, 54), width: 54, height: 54)
  col("5c294d").setFill()
  NSBezierPath(ovalIn: r).fill()
  let para = NSMutableParagraphStyle(); para.alignment = .center
  let f = NSFont(name: "Didot-Bold", size: 28) ?? .boldSystemFont(ofSize: 28)
  (b.n as NSString).draw(in: NSRect(x: r.minX, y: r.minY + 9, width: 54, height: 36), withAttributes: [.font: f, .foregroundColor: NSColor.white, .paragraphStyle: para])
}
NSGraphicsContext.restoreGraphicsState()
let png = args[2].lowercased().hasSuffix(".png")
let data = png ? rep.representation(using: .png, properties: [:])! : rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])!
try! data.write(to: URL(fileURLWithPath: args[2]))
