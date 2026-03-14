"use client";
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState({ open_time: '', max_capacity: 48 });

  // 데이터 가져오기 (시간순 정렬)
  const fetchData = useCallback(async () => {
    // 신청 시간(created_at) 기준으로 오름차순(asc) 정렬하면 누가 먼저 했는지 알기 쉽습니다.
    const { data: bData } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: true }); 
      
    const { data: sData } = await supabase.from('settings').select('*').maybeSingle();
    
    setBookings(bData || []);
    if (sData) {
      const d = new Date(sData.open_time);
      const localStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setSettings({ open_time: localStr, max_capacity: sData.max_capacity });
    }
  }, []);

  useEffect(() => {
    fetchData();
    const sub = supabase.channel('admin').on('postgres_changes', { event: '*', table: '*', schema: 'public' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [fetchData]);

  const updateSettings = async () => {
    const { error } = await supabase.from('settings').upsert({ 
      id: 1, 
      open_time: new Date(settings.open_time).toISOString(), 
      max_capacity: settings.max_capacity 
    });
    if (error) alert("저장 실패");
    else alert("설정 완료!");
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
            <label className="text-xs font-bold text-gray-400 block mb-1">오픈 시간 (예약 시작)</label>
            <input type="datetime-local" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-black outline-none" value={settings.open_time} onChange={e => setSettings({...settings, open_time: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">최대 수용 인원</label>
            <input type="number" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-black outline-none" value={settings.max_capacity} onChange={e => setSettings({...settings, max_capacity: parseInt(e.target.value)})} />
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
      </div>
    </div>
  );
}