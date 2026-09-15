import { describe, expect, it } from "vitest";
import { PLACEMENT, galleryPhotos, getPhotos, guiaPhoto } from "./photos";

/** La foto de la portada de /guia-dj queda reservada: no puede repetirse en la galería. */
describe("guiaPhoto", () => {
  const photos = getPhotos();

  it("devuelve la foto de PLACEMENT.guia y existe en public/photos", () => {
    const p = guiaPhoto(photos);
    expect(p?.src).toBe(`/photos/${PLACEMENT.guia}`);
  });

  it("no se repite en la galería ni en otra reserva", () => {
    const src = `/photos/${PLACEMENT.guia}`;
    expect(galleryPhotos(photos).map((p) => p.src)).not.toContain(src);
    const others = [PLACEMENT.hero, PLACEMENT.cierre, PLACEMENT.grabacionCierre, ...PLACEMENT.sala, ...PLACEMENT.curso, ...PLACEMENT.grabacion, ...PLACEMENT.grabacionSesion];
    expect(others).not.toContain(PLACEMENT.guia);
  });
});
