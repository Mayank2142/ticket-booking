import type { SeatStatus, SeatType } from "@cinebook/shared";
import { useRef, type KeyboardEvent } from "react";
import { displaySeatLabel } from "../lib/presentation";

export type SeatCell = {
  seatId: string;
  row: number;
  col: number;
  status: SeatStatus;
  category: { name: string; color: string };
  heldByMe?: boolean;
  seatType: SeatType;
  aisleAfter: boolean;
  isBlocked: boolean;
  viewLabel?: string | null;
  viewScore?: number | null;
  unavailableReason?: string | null;
};

export function SeatMap({ rows, cols, seats, selected, prices, onToggle }: {
  rows: number;
  cols: number;
  seats: SeatCell[];
  selected: string[];
  prices?: Record<string, number>;
  onToggle: (seatId: string, status: SeatStatus) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => seats.find((seat) => seat.row === row + 1 && seat.col === col + 1))
  );
  const availableSeats = seats.filter((seat) => !seat.isBlocked && seat.status !== "BOOKED" && seat.status !== "UNAVAILABLE" && (seat.status !== "HELD" || seat.heldByMe));
  const tabStopId = selected.find((seatId) => availableSeats.some((seat) => seat.seatId === seatId)) ?? availableSeats[0]?.seatId;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const scope = event.ctrlKey ? mapRef.current : event.currentTarget.closest(".seat-row-cells");
      const candidates = Array.from(scope?.querySelectorAll<HTMLButtonElement>("button.seat:not(:disabled)") ?? []);
      (event.key === "Home" ? candidates[0] : candidates[candidates.length - 1])?.focus();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    let nextRow = row + move[0];
    let nextCol = col + move[1];
    while (nextRow >= 1 && nextRow <= rows && nextCol >= 1 && nextCol <= cols) {
      const target = mapRef.current?.querySelector<HTMLButtonElement>(`[data-seat-row="${nextRow}"][data-seat-col="${nextCol}"]:not(:disabled)`);
      if (target) {
        target.focus();
        return;
      }
      nextRow += move[0];
      nextCol += move[1];
    }
  }

  return (
    <div className="seat-map-card" ref={mapRef} aria-describedby="seat-map-instructions">
      <p className="sr-only" id="seat-map-instructions">Use arrow keys to move between seats. Use Home and End for the first or last seat in a row, or Control plus Home and End for the whole auditorium. Press Space or Enter to select an available seat.</p>
      <div className="screen-wrap" aria-hidden="true"><span>Curved auditorium screen</span><div className="screen-arc" /><p>All eyes this way</p></div>
      <div className="seat-grid-scroll">
        <div className="seat-grid" role="group" aria-label={`Auditorium seating, ${rows} rows by ${cols} positions`}>
          {grid.map((row, rowIndex) => {
            const category = row.find(Boolean)?.category;
            const previousCategory = rowIndex ? grid[rowIndex - 1].find(Boolean)?.category.name : null;
            const showCategory = Boolean(category && category.name !== previousCategory);
            return (
              <div className="seat-category-group" key={rowIndex}>
                {showCategory && category && <div className="seat-category-header"><span>{category.name}</span>{prices?.[category.name] !== undefined && <strong>₹{prices[category.name].toLocaleString("en-IN")}</strong>}</div>}
                <div className="seat-row" role="group" aria-label={`Row ${displaySeatLabel(rowIndex + 1, 1).replace(/\d+$/, "")}`}>
                  <span className="row-label" aria-hidden="true">{displaySeatLabel(rowIndex + 1, 1).replace(/\d+$/, "")}</span>
                  <div className="seat-row-cells">
                    {row.map((seat, colIndex) => {
                      if (!seat) return <span className="seat-space" key={colIndex} />;
                      const isSelected = selected.includes(seat.seatId);
                      const disabled = seat.isBlocked || seat.status === "BOOKED" || seat.status === "UNAVAILABLE" || (seat.status === "HELD" && !seat.heldByMe);
                      const state = isSelected ? "selected" : seat.heldByMe ? "mine" : seat.status.toLowerCase();
                      const seatType = seat.seatType === "WHEELCHAIR" ? "Wheelchair-accessible space" : seat.seatType === "COMPANION" ? "Companion seat" : "Standard seat";
                      const detailParts = [displaySeatLabel(seat.row, seat.col), seat.category.name, seatType, seat.viewLabel, seat.viewScore ? `view ${seat.viewScore} of 5` : null, seat.unavailableReason, state].filter(Boolean);
                      const details = detailParts.join(" · ");
                      return (
                        <button
                          type="button"
                          key={seat.seatId}
                          disabled={disabled}
                          title={details}
                          aria-label={detailParts.join(", ")}
                          aria-pressed={isSelected}
                          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Control+Home Control+End"
                          tabIndex={seat.seatId === tabStopId ? 0 : -1}
                          data-seat-row={seat.row}
                          data-seat-col={seat.col}
                          onKeyDown={(event) => moveFocus(event, seat.row, seat.col)}
                          onClick={() => onToggle(seat.seatId, seat.status)}
                          className={`seat seat-${state} seat-type-${seat.seatType.toLowerCase()} ${seat.aisleAfter ? "seat-aisle" : ""}`}
                        >
                          <span>{displaySeatLabel(seat.row, seat.col)}</span>
                          {seat.seatType === "WHEELCHAIR" && <small aria-hidden="true">♿</small>}
                          {seat.seatType === "COMPANION" && <small aria-hidden="true">C</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{selected.length ? `${selected.length} seat${selected.length === 1 ? "" : "s"} selected.` : "No seats selected."}</p>
      <div className="seat-legend" aria-label="Seat status legend">
        <span><i className="legend-available" />Available</span><span><i className="legend-held" />Held</span><span><i className="legend-booked" />Booked</span><span><i className="legend-unavailable" />Unavailable</span><span><i className="legend-selected" />Selected</span><span><b aria-hidden="true">♿</b>Accessible</span><span><b aria-hidden="true">C</b>Companion</span>
      </div>
    </div>
  );
}
