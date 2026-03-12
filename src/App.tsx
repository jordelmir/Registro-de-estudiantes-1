import React, { useState, useEffect, useMemo } from 'react';
import { Users, CheckCircle, XCircle, Clock, Calendar, Search } from 'lucide-react';

// --- Types & Interfaces ---
type AttendanceStatus = 'present' | 'absent' | 'late' | 'unmarked';

interface StudentRecord {
  id: string;
  full_name: string;
  section: string;
  status: AttendanceStatus;
  timestamp: string | null;
}

// --- Mock Data (Relational DB Structure) ---
const MOCK_STUDENTS: StudentRecord[] = [
  { id: 'STU-1001', full_name: 'Ana García López', section: '10th Grade - A', status: 'unmarked', timestamp: null },
  { id: 'STU-1002', full_name: 'Carlos Rodríguez', section: '10th Grade - A', status: 'present', timestamp: '08:00 AM' },
  { id: 'STU-1003', full_name: 'Elena Martínez', section: '10th Grade - B', status: 'absent', timestamp: null },
  { id: 'STU-1004', full_name: 'David López Silva', section: '10th Grade - B', status: 'late', timestamp: '08:15 AM' },
  { id: 'STU-1005', full_name: 'Sofía Fernández', section: '10th Grade - A', status: 'present', timestamp: '07:55 AM' },
];

export default function App() {
  // --- State Management ---
  const [records, setRecords] = useState<StudentRecord[]>(MOCK_STUDENTS);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Derived State (Stats) ---
  const stats = useMemo(() => {
    return {
      total: records.length,
      present: records.filter(r => r.status === 'present').length,
      absent: records.filter(r => r.status === 'absent').length,
      late: records.filter(r => r.status === 'late').length,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter(record => 
      record.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [records, searchQuery]);

  // --- Effects ---
  useEffect(() => {
    // Aquí iría la carga inicial desde Supabase al cambiar la fecha
    // const fetchAttendance = async () => {
    //   const { data, error } = await supabase
    //     .from('attendance')
    //     .select('id, full_name, section, status, timestamp')
    //     .eq('date', selectedDate);
    //   if (data) setRecords(data);
    // };
    // fetchAttendance();
    
    // Para el mock, simplemente reseteamos si cambiamos de fecha (simulación)
    console.log(`Cargando datos para la fecha: ${selectedDate}`);
  }, [selectedDate]);

  // --- Handlers ---
  const handleStatusChange = async (studentId: string, newStatus: AttendanceStatus) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // 1. Optimistic UI Update (Mejora la UX al ser instantáneo)
    setRecords(prev => prev.map(record => 
      record.id === studentId 
        ? { ...record, status: newStatus, timestamp: newStatus === 'unmarked' ? null : now } 
        : record
    ));

    // 2. Supabase Integration Point
    /*
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ 
          status: newStatus, 
          timestamp: new Date().toISOString() 
        })
        .eq('student_id', studentId)
        .eq('date', selectedDate);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating attendance:', error);
      // Revertir estado optimista en caso de error
      // setRecords(previousState);
    }
    */
  };

  // --- Sub-components ---
  const StatCard = ({ title, value, icon: Icon, colorClass }: { title: string, value: number, icon: any, colorClass: string }) => (
    <div className="bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
      <div className={`p-3 rounded-xl ${colorClass} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Controls */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registro de Asistencia</h1>
            <p className="text-slate-500 mt-1">Gestiona la asistencia diaria de los estudiantes.</p>
          </div>
          
          <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md border border-slate-200 rounded-xl p-2 shadow-sm">
            <Calendar className="w-5 h-5 text-slate-400 ml-2" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-slate-700 font-medium cursor-pointer outline-none px-2"
            />
          </div>
        </header>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Alumnos" value={stats.total} icon={Users} colorClass="bg-blue-500 text-blue-600" />
          <StatCard title="Presentes" value={stats.present} icon={CheckCircle} colorClass="bg-emerald-500 text-emerald-600" />
          <StatCard title="Ausentes" value={stats.absent} icon={XCircle} colorClass="bg-rose-500 text-rose-600" />
          <StatCard title="Tardías" value={stats.late} icon={Clock} colorClass="bg-amber-500 text-amber-600" />
        </div>

        {/* Main Data Grid */}
        <main className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar por nombre o ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-6 py-4">ID Estudiante</th>
                  <th className="px-6 py-4">Nombre Completo</th>
                  <th className="px-6 py-4">Grado / Sección</th>
                  <th className="px-6 py-4 text-center">Estado de Asistencia</th>
                  <th className="px-6 py-4 text-right">Hora de Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No se encontraron estudiantes.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {student.id}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                        {student.full_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {student.section}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleStatusChange(student.id, 'present')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                              student.status === 'present' 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm ring-1 ring-emerald-500/20' 
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                          >
                            Presente
                          </button>
                          <button
                            onClick={() => handleStatusChange(student.id, 'absent')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                              student.status === 'absent' 
                                ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm ring-1 ring-rose-500/20' 
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                          >
                            Ausente
                          </button>
                          <button
                            onClick={() => handleStatusChange(student.id, 'late')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                              student.status === 'late' 
                                ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm ring-1 ring-amber-500/20' 
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                          >
                            Tardía
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 text-right font-mono">
                        {student.timestamp || '--:--'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
