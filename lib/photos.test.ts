import { describe, expect, it } from "vitest";
import { PLACEMENT, cursoClasePhotos, cursoDjsPhotos, cursoPhotos, galleryPhotos, getPhotos, guiaPendrivePhoto, guiaPhoto } from "./photos";

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

/** El bloque del estudio de /guia-pendrive-dj también queda reservado. */
describe("guiaPendrivePhoto", () => {
  const photos = getPhotos();

  it("devuelve la foto de PLACEMENT.guiaPendrive, existe y no se repite en la galería", () => {
    const src = `/photos/${PLACEMENT.guiaPendrive}`;
    expect(guiaPendrivePhoto(photos)?.src).toBe(src);
    expect(galleryPhotos(photos).map((p) => p.src)).not.toContain(src);
    expect(PLACEMENT.guiaPendrive).not.toBe(PLACEMENT.guia);
  });
});

/** /curso-dj usa media propia del curso (#120): reservada y fuera de la galería. */
describe("fotos del curso", () => {
  const photos = getPhotos();

  it("PLACEMENT.curso apunta a fotos curso-* (equipos + cierre), no a cabina-*", () => {
    expect(PLACEMENT.curso).toEqual(["curso-equipos-1.jpg", "curso-equipos-2.jpg", "curso-cierre-1.jpg"]);
    expect(cursoPhotos(photos).map((f) => f.src)).toEqual(PLACEMENT.curso.map((f) => `/photos/${f}`));
  });

  it("mosaico de DJs (4) y La clase (2) en el orden de display, con alt propio", () => {
    expect(cursoDjsPhotos(photos).map((f) => f.src)).toEqual([1, 2, 3, 4].map((n) => `/photos/curso-djs-${n}.jpg`));
    expect(cursoClasePhotos(photos).map((f) => f.src)).toEqual(["/photos/curso-clase-1.jpg", "/photos/curso-clase-2.jpg"]);
    for (const f of [...cursoDjsPhotos(photos), ...cursoClasePhotos(photos)]) expect(f.alt).toMatch(/DJ|clase|cabina|mixer|Pioneer/);
  });

  it("ninguna foto curso-* cae en la galería del home", () => {
    for (const f of galleryPhotos(photos)) expect(f.src).not.toMatch(/\/photos\/curso-/);
  });
});
