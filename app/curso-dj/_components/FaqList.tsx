import { FAQ } from "../_content";

/**
 * Native <details>/<summary> — server-rendered and keyboard-operable with no
 * client JS. A heading inside <summary> is valid HTML (summary permits one
 * heading-content element) and keeps the h2 → h3 outline for the section.
 */
export default function FaqList() {
  return (
    <div className="border hairline">
      {FAQ.map((f) => (
        <details key={f.q} className="group border-b hairline last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold [&::-webkit-details-marker]:hidden">
            <h3 className="font-display text-2xl text-bone transition-colors group-open:text-gold md:text-3xl">
              {f.q}
            </h3>
            <span
              aria-hidden
              className="font-display text-2xl text-gold transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="max-w-2xl px-6 pb-6 leading-relaxed text-bone-dim">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
