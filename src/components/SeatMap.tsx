"use client";

import { displaySeatLabel } from "@/lib/presentation";

type SeatCell = {
  seatId: string;
  label: string;
  row: number;
  col: number;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  category: { name: string; color: string };
  heldByMe?: boolean;
};

export function SeatMap({
  rows,
  cols,
  seats,
  selected,
  onToggle,
}: {
  rows: number;
  cols: number;
  seats: SeatCell[];
  selected: string[];
  onToggle: (seatId: string, status: string) => void;
}) {
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => seats.find((seat) => seat.row === row + 1 && seat.col === col + 1))
  );

  return (
    <div className="card overflow-hidden p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto h-7 w-[85%] rounded-[50%] border-t-4 border-emerald-300/80 shadow-[0_-10px_30px_rgba(52,211,153,.35)]" />
          <p className="-mt-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-200/55">Screen this way</p>
        </div>

        <div className="overflow-x-auto pb-3">
          <div className="mx-auto w-max space-y-2">
            {grid.map((row, rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-2">
                <span className="w-5 text-center text-[10px] font-semibold text-white/30">{displaySeatLabel(rowIndex + 1, 1).replace(/\d+$/, "")}</span>
                <div className="flex gap-1.5 sm:gap-2">
                  {row.map((seat, colIndex) => {
                    if (!seat) return <span key={colIndex} className="h-7 w-7 sm:h-8 sm:w-8" />;
                    const isSelected = selected.includes(seat.seatId);
                    const disabled = seat.status === "BOOKED" || (seat.status === "HELD" && !seat.heldByMe);
                    const state = isSelected ? "selected" : seat.status.toLowerCase();
                    const aisle = cols >= 6 && colIndex === Math.floor(cols / 2) - 1;
                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        title={`${displaySeatLabel(seat.row, seat.col)} · ${seat.category.name} · ${state}`}
                        aria-label={`${displaySeatLabel(seat.row, seat.col)}, ${seat.category.name}, ${state}`}
                        aria-pressed={isSelected}
                        disabled={disabled}
                        onClick={() => onToggle(seat.seatId, seat.status)}
                        className={`cinema-seat cinema-seat-${state} ${aisle ? "mr-4 sm:mr-6" : ""}`}
                      >
                        {displaySeatLabel(seat.row, seat.col)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-3 text-[11px] text-white/50">
          <Legend className="cinema-seat-available" label="Available" />
          <Legend className="cinema-seat-selected" label="Selected" />
          <Legend className="cinema-seat-held" label="Held" />
          <Legend className="cinema-seat-booked" label="Booked" />
        </div>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={`h-3.5 w-4 rounded-[4px] border ${className}`} />{label}</span>;
}
