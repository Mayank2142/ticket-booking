import type { SeatStatus } from "@cinebook/shared";
import { displaySeatLabel } from "../lib/presentation";

export type SeatCell = {
  seatId: string;
  row: number;
  col: number;
  status: SeatStatus;
  category: { name: string; color: string };
  heldByMe?: boolean;
};

export function SeatMap({ rows, cols, seats, selected, onToggle }: {
  rows: number;
  cols: number;
  seats: SeatCell[];
  selected: string[];
  onToggle: (seatId: string, status: SeatStatus) => void;
}) {
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => seats.find((seat) => seat.row === row + 1 && seat.col === col + 1))
  );

  return (
    <div className="seat-map-card">
      <div className="screen-wrap"><div className="screen-arc" /><p>Screen this way</p></div>
      <div className="seat-grid-scroll">
        <div className="seat-grid">
          {grid.map((row, rowIndex) => (
            <div className="seat-row" key={rowIndex}>
              <span className="row-label">{displaySeatLabel(rowIndex + 1, 1).replace(/\d+$/, "")}</span>
              <div className="seat-row-cells">
                {row.map((seat, colIndex) => {
                  if (!seat) return <span className="seat-space" key={colIndex} />;
                  const isSelected = selected.includes(seat.seatId);
                  const disabled = seat.status === "BOOKED" || (seat.status === "HELD" && !seat.heldByMe);
                  const state = isSelected ? "selected" : seat.heldByMe ? "mine" : seat.status.toLowerCase();
                  const aisle = cols >= 6 && colIndex === Math.floor(cols / 2) - 1;
                  return (
                    <button
                      type="button"
                      key={seat.seatId}
                      disabled={disabled}
                      title={`${displaySeatLabel(seat.row, seat.col)} · ${seat.category.name} · ${state}`}
                      aria-label={`${displaySeatLabel(seat.row, seat.col)}, ${seat.category.name}, ${state}`}
                      aria-pressed={isSelected}
                      onClick={() => onToggle(seat.seatId, seat.status)}
                      className={`seat seat-${state} ${aisle ? "seat-aisle" : ""}`}
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
      <div className="seat-legend" aria-label="Seat status legend">
        <span><i className="legend-available" />Available</span><span><i className="legend-held" />Held</span><span><i className="legend-booked" />Booked</span><span><i className="legend-selected" />Selected</span>
      </div>
    </div>
  );
}
