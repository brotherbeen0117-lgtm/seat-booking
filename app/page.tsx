"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// 학교 목록에 가재울고 추가됨
const SCHOOLS = ["명지고", "충암고", "이대부고", "가재울고", "정시반"];
const GRADES = ["고1", "고2", "고3"];
const TEACHERS = ["환T", "연T", "세T", "민T", "유T", "나T", "지T"];

export default function StudentPage() {
  const [formData, setFormData] = useState({ name: '', school: '명지고', grade: '고1', teacher: '환T', gender: '' });
  const [bookings, setBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

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

  const handleBooking = async () => {
    if (!settings) return alert("연결 중...");
    const now = new Date().getTime();
    const openTime = new Date(settings.open_time).getTime();

    if (now < openTime) {
      return alert(`아직 예약 시간이 아닙니다!\n오픈: ${new Date(settings.open_time).toLocaleString()}`);
    }

    if (bookings.length >= settings.max_capacity) return alert("정원 초과");
    if (!selectedSeat) return alert("좌석 선택 필수");
    
    const isDup = bookings.some(b => b.name === formData.name && b.school === formData.school);
    if (isDup) return alert("이미 예약된 정보입니다.");

    const { error } = await supabase.from('bookings').insert([{ ...formData, seat_number: selectedSeat }]);
    if (error) alert("선점된 좌석이거나 오류입니다.");
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

  const renderSeatCell = (num: number | null) => {
    if (num === null) return <div key={Math.random()} className="h-14 border border-gray-100 bg-gray-50/30"></div>;
    
    const isTaken = bookings.find(b => b.seat_number === num);
    const isFemaleSeat = num <= 23;
    const isGenderMatch = formData.gender === (isFemaleSeat ? '여' : '남');
    const canSelect = formData.gender && isGenderMatch && !isTaken;

    return (
      <div
        key={num}
        onClick={() => canSelect && setSelectedSeat(num)}
        className={`h-14 border flex items-center justify-center text-sm transition-all
          ${isTaken ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : 
            !isGenderMatch && formData.gender ? 'bg-gray-50 opacity-10 cursor-not-allowed border-gray-100' :
            selectedSeat === num ? 'bg-[#FF2D55] text-white font-bold border-[#FF2D55] z-10 shadow-inner' : 'bg-white hover:border-red-400 cursor-pointer border-gray-300'}`}
      >
        {num}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center text-black font-sans">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-6 border border-gray-100">
        <h1 className="text-xl font-bold text-center mb-6">채토피아 툰드라타운 좌석 예약</h1>
        
        <div className="space-y-3 mb-6">
          <input className="w-full p-4 border rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="이름을 입력해주세요" onChange={e => setFormData({...formData, name: e.target.value})} />
          <div className="grid grid-cols-2 gap-2">
            <select className="p-4 border rounded-xl bg-white" onChange={e => setFormData({...formData, school: e.target.value})}>{SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select className="p-4 border rounded-xl bg-white" onChange={e => setFormData({...formData, grade: e.target.value})}>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="p-4 border rounded-xl bg-white" onChange={e => setFormData({...formData, teacher: e.target.value})}>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select className={`p-4 border rounded-xl font-bold transition-colors ${formData.gender ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-gray-200 text-gray-400'}`} value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
              <option value="">성별 선택 (필수)</option>
              <option value="남">남학생</option>
              <option value="여">여학생</option>
            </select>
          </div>
        </div>

        {formData.gender && (
          <div className="mb-6 p-4 bg-white rounded-xl border border-gray-100 overflow-x-auto shadow-inner">
            <div className="grid grid-cols-3 gap-x-6 min-w-[450px]">
              {seatLayout.map((column) => (
                <div key={column.columnId} className="flex flex-col">
                  <div className="flex flex-col border-t border-l border-gray-300">
                    {column.upper.map((pair, j) => (
                      <div key={`upper-${j}`} className="grid grid-cols-2">
                        {pair.map(num => renderSeatCell(num))}
                      </div>
                    ))}
                  </div>
                  
                  {/* 요청하신 넉넉한 세로 간격 (h-15) */}
                  <div className="h-15"></div>
                  
                  <div className="flex flex-col border-t border-l border-gray-300">
                    {column.lower.map((pair, j) => (
                      <div key={`lower-${j}`} className="grid grid-cols-2">
                        {pair.map(num => renderSeatCell(num))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleBooking} className="w-full bg-[#FF2D55] text-white py-5 rounded-2xl font-bold text-xl active:scale-95 shadow-lg shadow-red-100 transition-all hover:bg-[#E6294D]">
          예약 완료하기
        </button>
      </div>
    </div>
  );
}