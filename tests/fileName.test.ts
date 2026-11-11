import { describe, it, expect } from "vitest";
import { cleanFileName } from "../functions/src/core/fileName";

// P-176: the original name of a document's file, kept to download it again under that name.
describe("cleanFileName (P-176)", () => {
  it("keeps an ordinary name, spaces and accents included", () => {
    expect(cleanFileName("Bolla di consegna BG125 – città.pdf")).toBe("Bolla di consegna BG125 – città.pdf");
  });
  it("only the last part of a path, never a folder", () => {
    expect(cleanFileName("C:\\Users\\x\\Desktop\\ddt.pdf")).toBe("ddt.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
  });
  it("no control characters, at most 120 characters", () => {
    expect(cleanFileName("a\u0000b\u001fc\u007f.pdf")).toBe("abc.pdf");
    expect(cleanFileName(`${"x".repeat(200)}.pdf`)).toHaveLength(120);
  });
  it("nothing usable: no name", () => {
    expect(cleanFileName("")).toBeNull();
    expect(cleanFileName("   ")).toBeNull();
    expect(cleanFileName(undefined)).toBeNull();
    expect(cleanFileName("folder/")).toBeNull();
  });
});
