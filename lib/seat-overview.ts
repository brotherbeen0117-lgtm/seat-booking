export type SeatBooking = {
  id: string;
  seat_number: number;
  name: string;
  school: string;
  grade: string;
  teacher: string;
  gender: string;
  created_at: string;
};

export const seatRows = ['No.', 'name', '학생번호', 'pw', '학부모번호'];

const schoolShortNames: Record<string, string> = {
  명지고: '명지',
  충암고: '충암',
  이대부고: '이대',
  가재울고: '가재울',
};

export function seatDetails(seat: number | null, bookings: Map<number, SeatBooking>) {
  if (seat === null) return [null, null, null, null, null];
  const booking = bookings.get(seat);
  return [seat, booking ? `${booking.grade}_${schoolShortNames[booking.school] ?? booking.school}_${booking.name}` : null, null, null, null];
}
