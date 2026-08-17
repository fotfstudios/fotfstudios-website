import { SITE, SITE_URL } from "@/lib/site";

/** Prose section for guide pages (same idiom as the local Section in /terminos). */
export function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t hairline pt-10">
      <h2 className="font-display text-bone" style={{ fontSize: "clamp(1.4rem,4vw,2rem)" }}>
        {title}
      </h2>
      <div className="mt-4 space-y-4 leading-relaxed text-bone-dim">{children}</div>
    </section>
  );
}

/** Article + BreadcrumbList JSON-LD for a guide page. */
export function guideJsonLd(opts: {
  slug: string;
  headline: string;
  description: string;
  datePublished: string;
}) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: opts.headline,
      description: opts.description,
      inLanguage: "es-CL",
      datePublished: opts.datePublished,
      mainEntityOfPage: `${SITE_URL}/${opts.slug}`,
      author: { "@type": "Organization", name: SITE.name, url: SITE_URL },
      publisher: {
        "@type": "LocalBusiness",
        "@id": `${SITE_URL}/#negocio`,
        name: SITE.name,
        url: SITE_URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: opts.headline, item: `${SITE_URL}/${opts.slug}` },
      ],
    },
  ];
}
