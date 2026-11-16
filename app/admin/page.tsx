"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { downloadSeatOverview } from '@/lib/download-seat-overview';
import { seatLayout } from '@/lib/seat-layout';
import { seatDetails, seatRows, type SeatBooking } from '@/lib/seat-overview';
import { supabase } from '@/lib/supabase';

const koreaOffsetMs = 9 * 60 * 60 * 1000;

function toKoreaInput(value: string | null) {
  return value ? new Date(new Date(value).getTime() + koreaOffsetMs).toISOString().slice(0, 16) : '';
}

function fromKoreaInput(value: string) {
  return value ? new Date(`${value}+09:00`).toISOString() : null;
}

export default function AdminPage() {
  const [bookings, setBookings] = useState<SeatBooking[]>([]);
  const [settings, setSettings] = useState({ open_time: '', max_capacity: 48, seat_access_starts_at: '', seat_access_ends_at: '' });
  const [exporting, setExporting] = useState(false);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const bookingsBySeat = useMemo(() => new Map(bookings.map(booking => [booking.seat_number, booking])), [bookings]);

  // 데이터 가져오기 (시간순 정렬)
  const fetchData = useCallback(async () => {
    // 신청 시간(created_at) 기준으로 오름차순(asc) 정렬하면 누가 먼저 했는지 알기 쉽습니다.
    const { data: bData, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: true }); 
      
    
    setBookingsLoaded(!bookingError);
    if (!bookingError) setBookings(bData || []);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data: sData } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (sData) {
      const d = new Date(sData.open_time);
      const localStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setSettings({
        open_time: localStr,
        max_capacity: sData.max_capacity,
        seat_access_starts_at: toKoreaInput(sData.seat_access_starts_at),
        seat_access_ends_at: toKoreaInput(sData.seat_access_ends_at),
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchSettings();
    const sub = supabase.channel('admin')
      .on('postgres_changes', { event: '*', table: 'bookings', schema: 'public' }, fetchData)
      .on('postgres_changes', { event: '*', table: 'settings', schema: 'public' }, fetchSettings)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [fetchData, fetchSettings]);

  const updateSettings = async () => {
    if (!settings.open_time) return alert('신규 예약 오픈 시간을 입력해주세요.');
    if (!Number.isInteger(settings.max_capacity)) return alert('최대 수용 인원을 입력해주세요.');

    const startsAt = fromKoreaInput(settings.seat_access_starts_at);
    const endsAt = fromKoreaInput(settings.seat_access_ends_at);
    if (startsAt && endsAt && startsAt >= endsAt) {
      return alert('내 좌석 확인·변경 마감 시간은 시작 시간보다 늦어야 합니다.');
    }

    const { error } = await supabase.from('settings').upsert({ 
      id: 1, 
      open_time: new Date(settings.open_time).toISOString(), 
      max_capacity: settings.max_capacity,
      seat_access_starts_at: startsAt,
      seat_access_ends_at: endsAt
    });
    if (error) {
      console.error('설정 저장 실패:', error);
      alert('저장 실패');
    }
    else {
      await fetchSettings();
      alert("설정 완료!");
    }
  };

  const resetAll = async () => {
    if (confirm("⚠️ 모든 예약 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      await supabase.from('bookings').delete().neq('name', '');
      alert("초기화되었습니다.");
    }
  };

  const deleteBooking = async (id: string) => {
    if (confirm("해당 예약을 삭제하시겠습니까?")) {
      await supabase.from('bookings').delete().eq('id', id);
    }
  };

  const exportSeats = async () => {
    setExporting(true);
    try {
      // Read the current records at download time, even if realtime is delayed.
      const { data, error } = await supabase.from('bookings').select('*');
      if (error) throw error;
      const currentBookings: SeatBooking[] = data ?? [];
      setBookings(currentBookings);
      setBookingsLoaded(true);
      await downloadSeatOverview(new Map(currentBookings.map(booking => [booking.seat_number, booking])));
    } catch (error) {
      console.error('좌석표 다운로드 실패:', error);
      alert('좌석표를 다운로드하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 text-black">
      <div className="max-w-5xl mx-auto">
        {/* 상단 헤더 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">시스템 관리</h1>
            <p className="text-sm text-gray-500">현재 총 {bookings.length}명 신청됨</p>
          </div>
          <button onClick={resetAll} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-200 transition">
            전체 초기화
          </button>
        </div>
        
        {/* 설정 영역 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-white p-6 rounded-2xl border shadow-sm">
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">오픈 시간 (신규 예약)</label>
            <input type="datetime-local" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-black outline-none" value={settings.open_time} onChange={e => setSettings({...settings, open_time: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">최대 수용 인원</label>
            <input type="number" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-black outline-none" value={settings.max_capacity} onChange={e => setSettings({...settings, max_capacity: parseInt(e.target.value)})} />
          </div>
          <div className="md:col-span-3 grid gap-4 border-t pt-4 md:grid-cols-3">
            <div>
              <label htmlFor="seat-access-start" className="block text-xs font-bold text-gray-500">내 좌석 확인·변경 시작 (한국 시간)</label>
              <input id="seat-access-start" type="datetime-local" className="mt-1 w-full rounded-lg border p-2"
                value={settings.seat_access_starts_at}
                onChange={e => setSettings({ ...settings, seat_access_starts_at: e.target.value })} />
            </div>
            <div>
              <label htmlFor="seat-access-end" className="block text-xs font-bold text-gray-500">내 좌석 확인·변경 마감 (한국 시간)</label>
              <input id="seat-access-end" type="datetime-local" className="mt-1 w-full rounded-lg border p-2"
                value={settings.seat_access_ends_at}
                onChange={e => setSettings({ ...settings, seat_access_ends_at: e.target.value })} />
            </div>
            <p className="self-end text-sm text-gray-500">시작이나 마감을 비워 두면 해당 시간 제한을 적용하지 않습니다.</p>
          </div>
          <button onClick={updateSettings} className="bg-black text-white rounded-lg font-bold h-10 mt-auto hover:bg-gray-800 transition">
            설정 저장
          </button>
        </div>

        {/* 예약 목록 테이블 */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="p-4 font-bold">순번</th>
                  <th className="p-4 font-bold">신청 시각</th>
                  <th className="p-4 font-bold">신청자</th>
                  <th className="p-4 font-bold">소속 정보</th>
                  <th className="p-4 font-bold text-center">좌석</th>
                  <th className="p-4 font-bold text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-gray-400">신청 내역이 없습니다.</td>
                  </tr>
                ) : (
                  bookings.map((b, index) => (
                    <tr key={b.id} className="hover:bg-gray-50 transition">
                      <td className="p-4 text-sm text-gray-400">{index + 1}</td>
                      <td className="p-4 text-xs font-mono text-blue-600">
                        {new Date(b.created_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        })}
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-gray-900">{b.name}</span>
                        <span className="ml-1 text-xs text-gray-500">({b.gender})</span>
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {b.school} · {b.grade}학년 · {b.teacher}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-block px-3 py-1 bg-red-50 text-red-600 rounded-full font-bold text-sm">
                          {b.seat_number}번
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => deleteBooking(b.id)} 
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <section className="mt-8 rounded-2xl border bg-white p-4 shadow-sm" aria-labelledby="seat-overview-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="seat-overview-title" className="text-xl font-bold">전체 좌석 배치표</h2>
            <button type="button" onClick={() => void exportSeats()} disabled={exporting}
              className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">
              {exporting ? '엑셀 만드는 중…' : '엑셀 다운로드'}
            </button>
          </div>
          {bookingsLoaded ? (
            <div className="overflow-x-auto">
              <div className="grid min-w-[880px] grid-cols-3 gap-5">
                {seatLayout.map(({ columnId, upper, lower }) => (
                  <div key={columnId} className="space-y-5">
                    {[upper, lower].map((pairs, sectionIndex) => (
                      <table key={sectionIndex} className="w-full table-fixed border-collapse text-xs">
                        <colgroup><col className="w-[72px]" /><col /><col /></colgroup>
                        <tbody>
                          {pairs.map(([left, right]) => {
                            const leftDetails = seatDetails(left, bookingsBySeat);
                            const rightDetails = seatDetails(right, bookingsBySeat);
                            return seatRows.map((label, fieldIndex) => (
                              <tr key={`${left}-${right}-${label}`} className={fieldIndex === 0 ? 'bg-[#BDD7EE] font-bold' : ''}>
                                <th scope="row" className="border border-gray-500 p-1 text-right font-medium">{label}</th>
                                <td className={`h-6 break-all border border-gray-500 px-1 text-center ${left === null ? 'bg-gray-200' : ''}`}>{leftDetails[fieldIndex]}</td>
                                <td className={`h-6 break-all border border-gray-500 px-1 text-center ${right === null ? 'bg-gray-200' : ''}`}>{rightDetails[fieldIndex]}</td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-gray-500">예약 목록을 불러오면 좌석 배치표가 표시됩니다.</p>}
        </section>
      </div>
    </div>
  );
}