type SeatPair = [number | null, number | null];

type SeatBlock = { columnId: string; upper: SeatPair[]; lower: SeatPair[] };

export const seatLayout: SeatBlock[] = [
    {
      columnId: "left",
      upper: [[null, 8], [1, 9], [2, 10], [3, 11], [4, 12]],
      lower: [[5, 13], [6, 14], [7, 15]]
    },
    {
      columnId: "center",
      upper: [[16, 24], [17, 25], [18, 26], [19, 27], [20, 28]],
      lower: [[21, 29], [22, 30], [23, null]]
    },
    {
      columnId: "right",
      upper: [[31, 40], [32, 41], [33, 42], [34, 43], [35, 44]],
      lower: [[36, 45], [37, 46], [38, 47], [39, 48]]
    }
  ];
