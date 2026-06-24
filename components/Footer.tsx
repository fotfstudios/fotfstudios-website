import Logo from "./Logo";
import { SITE, whatsappLink } from "@/lib/site";

export default function Footer() {
  const year = 2026;
  return (
    <footer className="border-t hairline bg-ink">
      <div className="mx-auto max-w-[1280px] px-5 py-16 md:px-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo variant="lockup" height={92} />
            <p className="font-editorial mt-6 max-w-xs text-lg text-bone-dim">
              El pulso, documentado.
            </p>
          </div>

          <div>
            <span className="label-sm text-bone-mute">Reservas</span>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bone transition-colors hover:text-gold"
                >
                  WhatsApp
                </a>
              </li>
              <li>
                <a
                  href={SITE.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bone transition-colors hover:text-gold"
                >
                  @{SITE.instagram}
                </a>
              </li>
              <li>
                <a
                  href={SITE.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bone transition-colors hover:text-gold"
                >
                  Cómo llegar
                </a>
              </li>
            </ul>
          </div>

          <div>
            <span className="label-sm text-bone-mute">Sala</span>
            <p className="mt-4 text-sm leading-relaxed text-bone-dim">
              {SITE.address}
            </p>
            <p className="mt-2 text-sm text-bone-mute">
              Sala de ensayo de DJ por hora · aislada acústicamente.
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t hairline pt-6 md:flex-row md:items-center md:justify-between">
          <span className="label-sm text-bone-mute">
            @{SITE.instagram} · {SITE.city}, {SITE.region} · {SITE.country}
          </span>
          <span className="label-sm text-bone-mute">
            © {year} {SITE.name} · {SITE.full}
          </span>
        </div>
      </div>
    </footer>
  );
}
