import PDFKit
// Words with positions via geometric selection: scan the page in thin horizontal bands, then words inside each band.
let d = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
let from = Int(CommandLine.arguments[2])!, to = Int(CommandLine.arguments[3])!
for p in from...to {
  guard let page = d.page(at: p-1), let all = page.selection(for: page.bounds(for:.mediaBox)) else { continue }
  var items: [(y: CGFloat, x: CGFloat, r: CGFloat, h: CGFloat, s: String)] = []
  for line in all.selectionsByLine() {
    let b = line.bounds(for: page); let s = (line.string ?? "").trimmingCharacters(in:.whitespacesAndNewlines)
    if s.isEmpty { continue }
    items.append((b.midY, b.minX, b.maxX, b.height, s))
  }
  items.sort { $0.y == $1.y ? $0.x < $1.x : $0.y > $1.y }
  for i in items { print("\(p)|\(Int(i.y))|\(Int(i.x))|\(Int(i.r))|\(i.s)") }
}
