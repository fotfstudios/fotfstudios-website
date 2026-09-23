import { describe, expect, it } from "vitest";
import { articleHref } from "./href";

describe("articleHref", () => {
  it("deja pasar las rutas internas legítimas", () => {
    expect(articleHref("/blog/como-elegir-audifonos")).toBe("/blog/como-elegir-audifonos");
    expect(articleHref("/aprender-dj")).toBe("/aprender-dj");
  });

  it("nada que apunte fuera del sitio sobrevive", () => {
    // `//evil.com` empieza con "/" pero es una URL relativa al protocolo: otro dominio.
    for (const malo of [
      "//evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/x?redirect=https://evil.com",
      "/x#<script>",
      "",
    ]) {
      expect(articleHref(malo), malo).toBe("/blog");
    }
  });
});
