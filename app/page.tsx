"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// 학교 목록에 가재울고 추가됨
const SCHOOLS = ["명지고", "충암고", "이대부고", "가재울고", "정시반"];
const GRADES = ["고1", "고2", "고3"];
const TEACHERS = ["환T", "연T", "세T", "민T", "유T", "나T", "지T"];

type SeatLookup = {
  seat_number: number;
  gender: '여' | '남';
  occupied: number[];
};

const SEAT_MESSAGES: Record<string, string> = {
  no_match: '입력한 정보와 일치하는 예약이 없습니다. 처음 예약할 때 입력한 내용을 확인해주세요.',
  multiple_matches: '같은 정보로 등록된 예약이 여러 건입니다. 관리자에게 문의해주세요.',
  invalid_seat: '등록된 성별에 맞는 좌석을 선택해주세요.',
  seat_changed: '현재 좌석이 바뀌었습니다. 좌석을 다시 선택해주세요.',
  seat_taken: '다른 학생이 이 좌석을 예약했습니다. 다른 좌석을 선택해주세요.',
};

export default function StudentPage() {
  const [formData, setFormData] = useState({ name: '', school: '명지고', grade: '고1', teacher: '환T', gender: '' });
  const [bookings, setBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [myBooking, setMyBooking] = useState<SeatLookup | null>(null);
  const [seatMessage, setSeatMessage] = useState('');
  const [seatRequestPending, setSeatRequestPending] = useState(false);
  const isExisting = mode === 'existing';
  const activeGender = isExisting ? myBooking?.gender : formData.gender;

  const fetchData = useCallback(async () => {
    try {
      const { data: bData } = await supabase.from('bookings').select('*');
      const { data: sData } = await supabase.from('settings').select('*').maybeSingle();
      setBookings(bData || []);
      setSettings(sData);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('student-realtime')
      .on('postgres_changes', { event: '*', table: 'bookings', schema: 'public' }, fetchData)
      .on('postgres_changes', { event: '*', table: 'settings', schema: 'public' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const switchMode = (nextMode: 'new' | 'existing') => {
    setMode(nextMode);
    setMyBooking(null);
    setSelectedSeat(null);
    setSeatMessage('');
  };

  const updateForm = (field: keyof typeof formData, value: string) => {
    setFormData(current => ({ ...current, [field]: value }));
    if (isExisting) {
      setMyBooking(null);
      setSeatMessage('');
    }
    if (isExisting || field === 'gender') setSelectedSeat(null);
  };

  const manageSeat = async (move = false) => {
    if (!formData.name.trim() || !formData.gender) {
      setSeatMessage('이름을 입력하고 성별을 선택해주세요.');
      return;
    }
    const details = {
      p_name: formData.name.trim(),
      p_school: formData.school,
      p_grade: formData.grade,
      p_teacher: formData.teacher,
      p_gender: formData.gender,
    };
    if (move && (!myBooking || selectedSeat === null)) return;

    setSeatRequestPending(true);
    setSeatMessage('');
    try {
      const { data, error } = await supabase.rpc('student_booking_seat', {
        ...details,
        p_new_seat: move ? selectedSeat : null,
        p_expected_seat: move ? myBooking?.seat_number : null,
      });
      if (error) throw error;

      if (data.status === 'ok') {
        setMyBooking(data);
        setSelectedSeat(null);
        if (move) {
          setSeatMessage(`${data.seat_number}번으로 좌석을 변경했어요.`);
          void fetchData();
        }
        return;
      }

      setSelectedSeat(null);
      setSeatMessage(SEAT_MESSAGES[data.status] ?? '좌석 정보를 확인하지 못했습니다.');
      if (data.status === 'seat_taken' || data.status === 'seat_changed') {
        const refreshed = await supabase.rpc('student_booking_seat', details);
        setMyBooking(refreshed.data?.status === 'ok' ? refreshed.data : null);
      } else if (data.status === 'no_match' || data.status === 'multiple_matches') {
        setMyBooking(null);
      }
    } catch (error) {
      console.error('좌석 조회 또는 변경 실패:', error);
      setSeatMessage('좌석 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSeatRequestPending(false);
    }
  };

  const handleBooking = async () => {
    if (!settings) return alert("연결 중...");

    // 시간 체크
    const now = new Date().getTime();
    const openTime = new Date(settings.open_time).getTime();
    if (now < openTime) {
      return alert(`아직 예약 시간이 아닙니다!\n오픈: ${new Date(settings.open_time).toLocaleString()}`);
    }

    if (bookings.length >= settings.max_capacity) return alert("정원 초과");
    if (!selectedSeat) return alert("좌석 선택 필수");
    if (!formData.name) return alert("이름을 입력해주세요.");
    if (!formData.gender) return alert("성별을 선택해주세요.");

    // 중복 체크 로직 수정: 이름, 학교, 학년, 선생님이 모두 같아야 중복으로 처리
    const isDup = bookings.some(b =>
      b.name === formData.name &&
      b.school === formData.school &&
      b.grade === formData.grade &&
      b.teacher === formData.teacher
    );

    if (isDup) return alert("이미 동일한 정보로 예약된 내역이 있습니다.");

    const { error } = await supabase.from('bookings').insert([{ ...formData, seat_number: selectedSeat }]);
    if (error) alert("이미 선점된 좌석이거나 오류가 발생했습니다.");
    else {
      alert("예약 성공!");
      setSelectedSeat(null);
    }
  };

  const seatLayout = useMemo(() => [
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
  ], []);

  const renderSeatCell = (num: number | null, index: number) => {
    if (num === null) return <div key={`empty-${index}`} className="h-14 border border-gray-100 bg-gray-50/30"></div>;

    const isMine = isExisting && myBooking?.seat_number === num;
    const isTaken = isExisting
      ? myBooking?.occupied.includes(num)
      : bookings.some(b => b.seat_number === num);
    const isGenderMatch = activeGender === (num <= 23 ? '여' : '남');
    const canSelect = isGenderMatch && !isTaken && !seatRequestPending;

    return (
      <button
        type="button"
        key={num}
        disabled={!canSelect}
        aria-pressed={selectedSeat === num}
        aria-label={isMine ? `${num}번, 내 좌석` : `${num}번 좌석`}
        onClick={() => setSelectedSeat(num)}
        className={`h-14 border flex items-center justify-center text-sm transition-all
          ${isMine ? 'bg-emerald-100 text-emerald-800 font-bold border-emerald-300' :
            isTaken ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' :
            !isGenderMatch ? 'bg-gray-50 opacity-10 cursor-not-allowed border-gray-100' :
            selectedSeat === num ? 'bg-[#FF2D55] text-white font-bold border-[#FF2D55] z-10 shadow-inner' : 'bg-white hover:border-red-400 cursor-pointer border-gray-300'}`}
      >
        {isMine ? `${num}번 (내 자리)` : num}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center text-black font-sans">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-6 border border-gray-100">
        <h1 className="text-xl font-bold text-center mb-6">채토피아 툰드라타운 좌석 예약</h1>

        <div className="grid grid-cols-2 gap-2 mb-6" aria-label="예약 메뉴">
          <button type="button" onClick={() => switchMode('new')} disabled={seatRequestPending}
            aria-pressed={!isExisting}
            className={`rounded-xl border p-3 font-bold ${!isExisting ? 'bg-gray-900 text-white' : 'bg-white'}`}>
            신규 예약
          </button>
          <button type="button" onClick={() => switchMode('existing')} disabled={seatRequestPending}
            aria-pressed={isExisting}
            className={`rounded-xl border p-3 font-bold ${isExisting ? 'bg-gray-900 text-white' : 'bg-white'}`}>
            내 좌석 확인·변경
          </button>
        </div>

        <form id="student-details" onSubmit={e => {
          e.preventDefault();
          if (isExisting) void manageSeat();
          else void handleBooking();
        }}>
          <fieldset disabled={seatRequestPending} className="space-y-3 mb-6">
            {isExisting && <p className="text-sm text-gray-600">처음 예약할 때 입력한 정보를 그대로 입력해주세요.</p>}
            <input aria-label="이름" className="w-full p-4 border rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="이름을 입력해주세요" value={formData.name} onChange={e => updateForm('name', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="학교" className="p-4 border rounded-xl bg-white" value={formData.school} onChange={e => updateForm('school', e.target.value)}>
                {SCHOOLS.map(school => <option key={school} value={school}>{school}</option>)}
              </select>
              <select aria-label="학년" className="p-4 border rounded-xl bg-white" value={formData.grade} onChange={e => updateForm('grade', e.target.value)}>
                {GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="담당 선생님" className="p-4 border rounded-xl bg-white" value={formData.teacher} onChange={e => updateForm('teacher', e.target.value)}>
                {TEACHERS.map(teacher => <option key={teacher} value={teacher}>{teacher}</option>)}
              </select>
              <select aria-label="성별" className="p-4 border rounded-xl bg-white font-bold" value={formData.gender} onChange={e => updateForm('gender', e.target.value)}>
                <option value="">성별 선택 (필수)</option>
                <option value="남">남학생</option>
                <option value="여">여학생</option>
              </select>
            </div>
            {isExisting && (
              <button type="submit" className="w-full rounded-xl bg-gray-900 p-3 font-bold text-white disabled:opacity-50">
                좌석 확인
              </button>
            )}
            {isExisting && myBooking && (
              <p className="text-sm">현재 <strong>{myBooking.seat_number}번</strong> 좌석이에요. 변경할 빈 좌석을 선택해주세요.</p>
            )}
          </fieldset>
        </form>

        {activeGender && (
          <div className="mb-6 p-4 bg-white rounded-xl border border-gray-100 overflow-x-auto shadow-inner">
            <div className="grid grid-cols-3 gap-x-6 min-w-[450px]">
              {seatLayout.map((column) => (
                <div key={column.columnId} className="flex flex-col">
                  <div className="flex flex-col border-t border-l border-gray-300">
                    {column.upper.map((pair, j) => (
                      <div key={`upper-${j}`} className="grid grid-cols-2">
                        {pair.map(renderSeatCell)}
                      </div>
                    ))}
                  </div>

                  {/* 요청하신 넉넉한 세로 간격 (h-15) */}
                  <div className="h-15"></div>

                  <div className="flex flex-col border-t border-l border-gray-300">
                    {column.lower.map((pair, j) => (
                      <div key={`lower-${j}`} className="grid grid-cols-2">
                        {pair.map(renderSeatCell)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isExisting ? (
          <>
            {myBooking && (
              <button type="button" onClick={() => void manageSeat(true)}
                disabled={selectedSeat === null || seatRequestPending}
                className="w-full rounded-2xl bg-[#FF2D55] py-4 text-lg font-bold text-white disabled:opacity-50">
                {selectedSeat === null ? '변경할 좌석 선택' : `${selectedSeat}번으로 변경하기`}
              </button>
            )}
            <p role="status" className="mt-3 text-sm text-gray-700">
              {seatRequestPending ? '좌석 정보를 확인하고 있어요…' : seatMessage}
            </p>
          </>
        ) : (
          <button type="submit" form="student-details" className="w-full bg-[#FF2D55] text-white py-5 rounded-2xl font-bold text-xl active:scale-95 shadow-lg shadow-red-100 transition-all hover:bg-[#E6294D]">
            예약 완료하기
          </button>
        )}
      </div>
    </div>
  );
}
