import { fmtUsd } from "@/lib/format";
import type { CardSummary } from "@/lib/types";

/* eslint-disable @next/next/no-img-element */

export default function CardTile({
  card,
  footer,
  onOpen,
}: {
  card: CardSummary;
  footer?: React.ReactNode;
  onOpen: (id: string) => void; // opens the card modal
}) {
  const inner = (
    <>
      <div className="aspect-[63/88] overflow-hidden rounded-lg bg-elevated">
        {card.image ? (
          <img
            src={card.image}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted">
            {card.name}
          </div>
        )}
      </div>
      <div className="mt-2 px-1">
        <div className="truncate text-sm font-medium">{card.name}</div>
        <div className="truncate text-xs text-muted">
          {card.setName ? `${card.setName} · ` : ""}
          {card.localId ? `${card.localId}` : ""}
        </div>
      </div>
    </>
  );

  return (
    <div className="fade-up group rounded-xl border border-edge bg-surface p-2 transition-colors hover:border-accent-dim">
      <button onClick={() => onOpen(card.id)} className="block w-full text-left">
        {inner}
      </button>
      {footer ? (
        <div className="mt-2 px-1">{footer}</div>
      ) : card.priceUsd != null ? (
        <div className="mt-2 flex items-baseline gap-2 px-1 font-mono text-xs">
          <span className="text-accent">{fmtUsd(card.priceUsd)}</span>
          {card.priceSource === "renaiss" && card.priceTcgUsd != null && (
            <span className="text-muted" title="TCGPlayer Market">
              TCG {fmtUsd(card.priceTcgUsd)}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
