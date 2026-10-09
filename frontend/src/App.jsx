import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const socket = io('http://localhost:3000', {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 3000
});

const FRIGATE_HTTP_URL = 'http://10.10.2.78:5000'; 

function App() {
  const [alertas, setAlertas] = useState([]);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorLogin, setErrorLogin] = useState('');

  // Estados de conectividad de la plataforma
  const [estadoSocket, setEstadoSocket] = useState(false);
  const [estadoMqtt, setEstadoMqtt] = useState(true);

  // Reloj digital en tiempo real
  const [relojActual, setRelojActual] = useState('');

  const [pestanaActiva, setPestanaActiva] = useState('monitoreo');
  const [camarasGuardadas, setCamarasGuardadas] = useState({});
  const [sitioSeleccionado, setSitioSeleccionado] = useState('');

  // Filtro global de CEDIS para estadísticas y modo mapa de calor
  const [cedisEstadisticasFiltro, setCedisEstadisticasFiltro] = useState('');
  const [modoMapaCalor, setModoMapaCalor] = useState(false);

  const [areasExpandidas, setAreasExpandidas] = useState({});
  const [subareasExpandidas, setSubareasExpandidas] = useState({});

  const [editandoKey, setEditandoKey] = useState(null);
  
  // Estado para el modal Popup de Edición de Estructura de Sitio
  const [sitioEditandoPopup, setSitioEditandoPopup] = useState(null);
  const [formPopupEstructura, setFormPopupEstructura] = useState({
    nuevoCedis: '',
    zonaActual: '',
    nuevaZona: '',
    subzonaActual: '',
    nuevaSubzona: ''
  });

  const [formJerarquia, setFormJerarquia] = useState({
    cedis: '',      
    zona: '',       
    subzona: '',    
    dispositivo: '' 
  });
  const [mensajeForm, setMensajeForm] = useState('');

  const [historialDias, setHistorialDias] = useState(30);
  const [listaHistorial, setListaHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const [filtroCedis, setFiltroCedis] = useState('');
  const [filtroZona, setFiltroZona] = useState('');
  const [filtroSubzona, setFiltroSubzona] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  const [modalExportarAbierto, setModalExportarAbierto] = useState(false);
  const [rangoExportar, setRangoExportar] = useState({
    fechaInicio: '',
    horaInicio: '00:00',
    fechaFin: '',
    horaFin: '23:59'
  });

  const [imagenModal, setImagenModal] = useState(null);
  const [camaraParaAsignar, setCamaraParaAsignar] = useState(null); 
  const [formAsignacionRapida, setFormAsignacionRapida] = useState({
    cedis: '',
    zona: '',
    subzona: '',
    dispositivo: ''
  });

  // Estados para el E-Map Interactivo, Zoom, Trampas Atendidas y Configuración Manual de Hora
  const [emapPosiciones, setEmapPosiciones] = useState({});
  const [emapPlanos, setEmapPlanos] = useState({});
  const [emapSitioActual, setEmapSitioActual] = useState('');
  const [archivoPlano, setArchivoPlano] = useState(null);
  const [camaraSeleccionadaEmap, setCamaraSeleccionadaEmap] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [alertasAtendidas, setAlertasAtendidas] = useState({});

  const [desfaseMinutos, setDesfaseMinutos] = useState(
    parseInt(localStorage.getItem('desfase_minutos_manual') || '0')
  );
  const [mensajeSettings, setMensajeSettings] = useState('');

  // Acceso Root Total (Patrón activado)
  const esAdmin = true;

  // Efecto para actualizar el reloj en tiempo real aplicando el desfase manual exacto
  useEffect(() => {
    const actualizarReloj = () => {
      const ahora = new Date();
      ahora.setMinutes(ahora.getMinutes() + parseInt(desfaseMinutos));
      const anio = ahora.getFullYear();
      const mes = String(ahora.getMonth() + 1).padStart(2, '0');
      const dia = String(ahora.getDate()).padStart(2, '0');
      const horas = String(ahora.getHours()).padStart(2, '0');
      const minutos = String(ahora.getMinutes()).padStart(2, '0');
      const segundos = String(ahora.getSeconds()).padStart(2, '0');
      setRelojActual(`${anio}-${mes}-${dia} ${horas}:${minutos}:${segundos}`);
    };

    actualizarReloj();
    const intervaloReloj = setInterval(actualizarReloj, 1000);
    return () => clearInterval(intervaloReloj);
  }, [desfaseMinutos]);

  const calcularDesfaseManual = (e) => {
    e.preventDefault();
    const horaObjetivoInput = e.target.horaObjetivo.value; 
    if (!horaObjetivoInput) return;

    const [targetHours, targetMinutes] = horaObjetivoInput.split(':').map(Number);
    const ahora = new Date();
    const currentHours = ahora.getHours();
    const currentMinutes = ahora.getMinutes();

    const diffMinutos = (targetHours * 60 + targetMinutes) - (currentHours * 60 + currentMinutes);

    setDesfaseMinutos(diffMinutos);
    localStorage.setItem('desfase_minutos_manual', diffMinutos);
    setMensajeSettings(`✅ ¡Hora sincronizada con éxito! Desfase aplicado: ${diffMinutos} minutos.`);
    setTimeout(() => setMensajeSettings(''), 4000);
  };

  const formatearFechaHora = (timestampOriginal) => {
    if (!timestampOriginal) return 'N/A';
    try {
      const fecha = new Date(timestampOriginal);
      fecha.setMinutes(fecha.getMinutes() + parseInt(desfaseMinutos));
      return fecha.toISOString().replace('T', ' ').substring(0, 19);
    } catch (e) {
      return timestampOriginal;
    }
  };

  const obtenerCamarasGuardadas = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/camaras');
      const data = await res.json();
      if (res.ok) {
        setCamarasGuardadas(data);
        const sitios = [...new Set(Object.values(data).map(c => c.cedis))].filter(s => s && s !== 'No agregada');
        if (sitios.length > 0 && !emapSitioActual) {
          setEmapSitioActual(sitios[0]);
        }
      }
    } catch (err) {
      console.error('Error al obtener el catálogo:', err);
    }
  };

  const obtenerEmapDatos = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/emap');
      const data = await res.json();
      if (res.ok) {
        setEmapPosiciones(data.posiciones || {});
        setEmapPlanos(data.planos || {});
      }
    } catch (err) {
      console.error('Error al obtener datos de E-Map:', err);
    }
  };

  useEffect(() => {
    socket.on('connect', () => setEstadoSocket(true));
    socket.on('disconnect', () => setEstadoSocket(false));

    socket.on('alerta_movimiento', (data) => {
      setEstadoMqtt(true);
      // Mapeamos o etiquetamos la alerta con terminología de roedores/trampas
      const alertaRoedor = {
        ...data,
        etiqueta: data.etiqueta === 'persona' || data.etiqueta === 'movimiento' ? 'ROEDOR DETECTADO' : (data.etiqueta || 'ACTIVIDAD TRAMPA')
      };
      setAlertas((prevAlertas) => [alertaRoedor, ...prevAlertas]);
      setAlertasAtendidas(prev => ({ ...prev, [data.keyFrigate]: false }));
    });

    if (token) {
      obtenerCamarasGuardadas();
      obtenerEmapDatos();
      obtenerHistorial(30);
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('alerta_movimiento');
    };
  }, [token]);

  const marcarAlertaAtendida = (keyFrigate) => {
    setAlertasAtendidas(prev => ({ ...prev, [keyFrigate]: true }));
  };

  const obtenerHistorial = async (dias) => {
    setCargandoHistorial(true);
    try {
      const res = await fetch(`http://localhost:3000/api/eventos/${dias}`);
      const data = await res.json();
      if (res.ok) {
        setListaHistorial(data);
      }
    } catch (err) {
      console.error('Error al obtener el historial:', err);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const borrarHistorialDB = async () => {
    if (!window.confirm("⚠️ ¿Estás completamente seguro de borrar TODO el registro de capturas e historial?")) {
      return;
    }

    try {
      const res = await fetch('http://localhost:3000/api/eventos', {
        method: 'DELETE'
      });
      if (res.ok) {
        setListaHistorial([]);
        alert("✅ Historial borrado correctamente.");
      }
    } catch (err) {
      console.error('Error al borrar el historial:', err);
    }
  };

  const manejarClickPlano = async (e) => {
    if (!camaraSeleccionadaEmap || !emapSitioActual) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    try {
      const formData = new FormData();
      formData.append('keyFrigate', camaraSeleccionadaEmap);
      formData.append('cedis', emapSitioActual);
      formData.append('x', x);
      formData.append('y', y);

      const res = await fetch('http://localhost:3000/api/emap', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        obtenerEmapDatos();
        setCamaraSeleccionadaEmap(null);
      }
    } catch (err) {
      console.error('Error al guardar posición en E-Map', err);
    }
  };

  const subirPlanoServidor = async (e) => {
    e.preventDefault();
    if (!archivoPlano || !emapSitioActual) {
      alert("Selecciona una imagen y un sitio primero.");
      return;
    }

    const formData = new FormData();
    formData.append('planoFile', archivoPlano);
    formData.append('cedis', emapSitioActual);

    try {
      const res = await fetch('http://localhost:3000/api/emap', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        alert('✅ Plano subido y guardado correctamente.');
        setArchivoPlano(null);
        obtenerEmapDatos();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error al subir plano', err);
      alert('❌ Error al conectar con el servidor.');
    }
  };

  const historialFiltrado = listaHistorial.filter(item => {
    const matchCedis = filtroCedis ? item.cedis === filtroCedis : true;
    const matchZona = filtroZona ? item.zona === filtroZona : true;
    const matchSubzona = filtroSubzona ? item.subzona === filtroSubzona : true;
    const matchBusqueda = filtroBusqueda 
      ? item.dispositivo.toLowerCase().includes(filtroBusqueda.toLowerCase()) || 
        item.etiqueta.toLowerCase().includes(filtroBusqueda.toLowerCase())
      : true;

    return matchCedis && matchZona && matchSubzona && matchBusqueda;
  });

  const cedisHistorialUnicos = [...new Set(listaHistorial.map(i => i.cedis))];
  const zonasHistorialUnicas = [...new Set(listaHistorial.filter(i => !filtroCedis || i.cedis === filtroCedis).map(i => i.zona))];
  const subzonasHistorialUnicas = [...new Set(listaHistorial.filter(i => (!filtroCedis || i.cedis === filtroCedis) && (!filtroZona || i.zona === filtroZona)).map(i => i.subzona))];

  // Cálculo de frecuencias por trampa para el Mapa de Calor
  const conteoEventosPorTrampa = listaHistorial.reduce((acc, curr) => {
    const k = curr.keyFrigate || curr.dispositivo;
    if (k) {
      acc[k] = (acc[k] || 0) + 1;
    }
    return acc;
  }, {});

  const historialEstadisticasFiltrado = cedisEstadisticasFiltro 
    ? listaHistorial.filter(item => item.cedis === cedisEstadisticasFiltro)
    : listaHistorial;

  const datosGraficaDispositivos = Object.values(
    historialEstadisticasFiltrado.reduce((acc, curr) => {
      const nombre = curr.dispositivo || 'Desconocido';
      if (!acc[nombre]) acc[nombre] = { dispositivo: nombre, eventos: 0 };
      acc[nombre].eventos += 1;
      return acc;
    }, {})
  ).slice(0, 8);

  const datosGraficaSitios = Object.values(
    historialEstadisticasFiltrado.reduce((acc, curr) => {
      const sitio = curr.cedis || 'Sin Asignar';
      if (!acc[sitio]) acc[sitio] = { name: sitio, value: 0 };
      acc[sitio].value += 1;
      return acc;
    }, {})
  );

  const COLORES_PIE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6'];

  const confirmarExportacionExcel = (e) => {
    e.preventDefault();
    let datosParaExportar = historialFiltrado;

    if (rangoExportar.fechaInicio && rangoExportar.fechaFin) {
      const inicio = new Date(`${rangoExportar.fechaInicio}T${rangoExportar.horaInicio || '00:00'}:00`);
      const fin = new Date(`${rangoExportar.fechaFin}T${rangoExportar.horaFin || '23:59'}:59`);

      datosParaExportar = historialFiltrado.filter(item => {
        const fechaItem = new Date(item.timestamp);
        return fechaItem >= inicio && fechaItem <= fin;
      });
    }

    if (datosParaExportar.length === 0) {
      alert("No hay registros en el rango especificado.");
      return;
    }

    let csvContent = "\uFEFF"; 
    csvContent += "ID Captura,Dispositivo / Trampa,Estatus,CEDIS,Área,Sub-área,Fecha y Hora\n";

    datosParaExportar.forEach(item => {
      const fechaAjustada = formatearFechaHora(item.timestamp);
      const fila = [
        `"${item.id_foto || 'N/A'}"`,
        `"${item.dispositivo || ''}"`,
        `"${item.etiqueta || ''}"`,
        `"${item.cedis || ''}"`,
        `"${item.zona || ''}"`,
        `"${item.subzona || ''}"`,
        `"${fechaAjustada}"`
      ];
      csvContent += fila.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_bioseguridad_roedores_${rangoExportar.fechaInicio || 'completo'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setModalExportarAbierto(false);
  };

  useEffect(() => {
    if ((pestanaActiva === 'historial' || pestanaActiva === 'estadisticas' || pestanaActiva === 'emap') && token) {
      obtenerHistorial(historialDias);
    }
  }, [pestanaActiva, historialDias, token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorLogin('');
    try {
      const res = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        localStorage.setItem('token', data.token);
        obtenerCamarasGuardadas();
        obtenerEmapDatos();
      } else {
        setErrorLogin(data.error || 'Credenciales incorrectas');
      }
    } catch (err) {
      setErrorLogin('No se pudo conectar con el servidor');
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('token');
  };

  const guardarEstructura = async (e) => {
    e.preventDefault();
    setMensajeForm('');

    const keyFrigate = editandoKey || formJerarquia.dispositivo.toLowerCase().replace(/\s+/g, '_');

    try {
      const res = await fetch('http://localhost:3000/api/camaras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyFrigate,
          cedis: formJerarquia.cedis,
          zona: formJerarquia.zona,
          subzona: formJerarquia.subzona,
          dispositivo: formJerarquia.dispositivo
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMensajeForm('✅ Estructura guardada/actualizada con éxito');
        setFormJerarquia({ cedis: '', zona: '', subzona: '', dispositivo: '' });
        setEditandoKey(null);
        obtenerCamarasGuardadas();
      } else {
        setMensajeForm(`❌ ${data.error}`);
      }
    } catch (err) {
      setMensajeForm('❌ Error al conectar con el servidor');
    }
  };

  const guardarAsignacionRapida = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/camaras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyFrigate: camaraParaAsignar.keyFrigate,
          cedis: formAsignacionRapida.cedis,
          zona: formAsignacionRapida.zona,
          subzona: formAsignacionRapida.subzona,
          dispositivo: formAsignacionRapida.dispositivo
        })
      });
      if (res.ok) {
        setCamaraParaAsignar(null);
        obtenerCamarasGuardadas();
        obtenerHistorial(historialDias);
      }
    } catch (err) {
      console.error('Error al guardar asignación rápida', err);
    }
  };

  const iniciarEdicion = (key, info) => {
    setEditandoKey(key);
    setFormJerarquia({
      cedis: info.cedis,
      zona: info.zona,
      subzona: info.subzona,
      dispositivo: info.dispositivo
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const abrirPopupEdicionSitio = (sitio) => {
    setSitioEditandoPopup(sitio);
    setFormPopupEstructura({
      nuevoCedis: sitio,
      zonaActual: '',
      nuevaZona: '',
      subzonaActual: '',
      nuevaSubzona: ''
    });
  };

  const guardarPopupEstructura = async (e) => {
    e.preventDefault();
    if (!sitioEditandoPopup) return;

    const nuevoCatalogo = { ...camarasGuardadas };
    let actualizadas = 0;

    Object.entries(nuevoCatalogo).forEach(([key, cam]) => {
      if (cam.cedis === sitioEditandoPopup) {
        let cambia = false;
        if (formPopupEstructura.nuevoCedis) {
          cam.cedis = formPopupEstructura.nuevoCedis;
          cambia = true;
        }
        if (formPopupEstructura.zonaActual && cam.zona === formPopupEstructura.zonaActual && formPopupEstructura.nuevaZona) {
          cam.zona = formPopupEstructura.nuevaZona;
          cambia = true;
        }
        if (formPopupEstructura.subzonaActual && cam.subzona === formPopupEstructura.subzonaActual && formPopupEstructura.nuevaSubzona) {
          cam.subzona = formPopupEstructura.nuevaSubzona;
          cambia = true;
        }
        if (cambia) actualizadas++;
      }
    });

    if (actualizadas === 0) {
      alert("No se aplicó ningún cambio en las áreas o subáreas seleccionadas.");
      return;
    }

    try {
      const res = await fetch('http://localhost:3000/api/camaras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sincronizarCompleto: true, nuevoCatalogo })
      });

      if (res.ok) {
        alert("✅ Estructura del sitio actualizada correctamente.");
        setCamarasGuardadas(nuevoCatalogo);
        setSitioEditandoPopup(null);
        obtenerHistorial(historialDias);
      }
    } catch (err) {
      console.error("Error al actualizar la estructura del sitio", err);
      alert("❌ Error al conectar con el servidor.");
    }
  };

  const abrirModalAsignacion = (nombreCamara) => {
    setCamaraParaAsignar({ keyFrigate: nombreCamara });
    const primerCedis = sitiosUnicos[0] || '';
    const areasDelSitio = [...new Set(Object.values(camarasGuardadas).filter(c => c.cedis === primerCedis).map(c => c.zona))].filter(z => z && z !== 'No agregada');
    const primeraArea = areasDelSitio[0] || '';
    const subareasDelSitio = [...new Set(Object.values(camarasGuardadas).filter(c => c.cedis === primerCedis && c.zona === primeraArea).map(c => c.subzona))].filter(sz => sz && sz !== 'No agregada');
    const primeraSubarea = subareasDelSitio[0] || '';

    setFormAsignacionRapida({
      cedis: primerCedis,
      zona: primeraArea,
      subzona: primeraSubarea,
      dispositivo: nombreCamara
    });
  };

  const agregarDirectoInCedis = (sitio) => {
    setEditandoKey(null);
    setFormJerarquia({
      cedis: sitio,
      zona: '',
      subzona: '',
      dispositivo: ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminarUbicacion = async (key) => {
    if (!window.confirm('¿Estás seguro de eliminar esta trampa/dispositivo de la estructura?')) return;
    
    const nuevoCatalogo = { ...camarasGuardadas };
    delete nuevoCatalogo[key];
    setCamarasGuardadas(nuevoCatalogo);

    try {
      await fetch('http://localhost:3000/api/camaras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sincronizarCompleto: true, nuevoCatalogo })
      });
    } catch (err) {
      console.error("Error al actualizar servidor", err);
    }
  };

  const sitiosUnicos = [...new Set(Object.values(camarasGuardadas).map(c => c.cedis))].filter(s => s && s !== 'No agregada');

  const areasDelSitioActual = [...new Set(
    Object.values(camarasGuardadas)
      .filter(c => c.cedis === formJerarquia.cedis)
      .map(c => c.zona)
  )].filter(z => z && z !== 'No agregada');

  const subareasDelSitioActual = [...new Set(
    Object.values(camarasGuardadas)
      .filter(c => c.cedis === formJerarquia.cedis && c.zona === formJerarquia.zona)
      .map(c => c.subzona)
  )].filter(sz => sz && sz !== 'No agregada');

  const areasDelModal = [...new Set(
    Object.values(camarasGuardadas)
      .filter(c => c.cedis === formAsignacionRapida.cedis)
      .map(c => c.zona)
  )].filter(z => z && z !== 'No agregada');

  const subareasDelModal = [...new Set(
    Object.values(camarasGuardadas)
      .filter(c => c.cedis === formAsignacionRapida.cedis && c.zona === formAsignacionRapida.zona)
      .map(c => c.subzona)
  )].filter(sz => sz && sz !== 'No agregada');

  const zonasDelSitioPopup = [...new Set(
    Object.values(camarasGuardadas)
      .filter(c => c.cedis === sitioEditandoPopup)
      .map(c => c.zona)
  )].filter(z => z && z !== 'No agregada');

  const subzonasDelSitioPopup = [...new Set(
    Object.values(camarasGuardadas)
      .filter(c => c.cedis === sitioEditandoPopup && c.zona === formPopupEstructura.zonaActual)
      .map(c => c.subzona)
  )].filter(sz => sz && sz !== 'No agregada');

  const obtenerEstructuraCedis = (sitio) => {
    const dispositivos = Object.entries(camarasGuardadas).filter(([_, c]) => c.cedis === sitio);
    const arbol = {};

    dispositivos.forEach(([key, cam]) => {
      const area = cam.zona || 'General';
      const subarea = cam.subzona || 'General';

      if (!arbol[area]) arbol[area] = {};
      if (!arbol[area][subarea]) arbol[area][subarea] = [];

      arbol[area][subarea].push({ key, ...cam });
    });

    return arbol;
  };

  const toggleArea = (area) => {
    setAreasExpandidas(prev => ({ ...prev, [area]: !prev[area] }));
  };

  const toggleSubarea = (subareaKey) => {
    setSubareasExpandidas(prev => ({ ...prev, [subareaKey]: !prev[subareaKey] }));
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Acceso al Sistema</h2>
          <p className="text-slate-400 text-sm mb-6 text-center">Monitoreo de Roedores y Bioseguridad</p>
          
          {errorLogin && (
            <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded-lg mb-4 text-sm text-center">
              {errorLogin}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-xs font-medium mb-1">Usuario</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                placeholder="admin"
                required 
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-medium mb-1">Contraseña</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
                required 
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition duration-200 shadow-lg shadow-indigo-600/30"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  const estructuraActual = sitioSeleccionado ? obtenerEstructuraCedis(sitioSeleccionado) : {};
  const totalDispositivosCedis = Object.values(estructuraActual).reduce((acc, subareas) => {
    return acc + Object.values(subareas).reduce((subAcc, cams) => subAcc + cams.length, 0);
  }, 0);

  const rutaPlanoCruda = emapPlanos[emapSitioActual] || emapPlanos[emapSitioActual?.trim()?.toLowerCase()] || '';
  const planoActualCedis = rutaPlanoCruda.startsWith('http') 
    ? rutaPlanoCruda 
    : (rutaPlanoCruda ? `http://localhost:3000${rutaPlanoCruda}` : '');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6 relative">
      
      {/* ICONOS DE ESTADO Y RELOJ EN TIEMPO REAL FLOTANTES */}
      <div className="fixed top-3 right-6 z-50 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 shadow-xl text-[10px]">
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${estadoSocket ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className="text-slate-300 font-medium">Servidor: {estadoSocket ? 'OK' : 'Off'}</span>
        </div>
        <div className="h-3 w-[1px] bg-slate-800"></div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${estadoMqtt ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
          <span className="text-slate-300 font-medium">Sensores: {estadoMqtt ? 'En línea' : 'Off'}</span>
        </div>
        <div className="h-3 w-[1px] bg-slate-800"></div>
        <div className="text-emerald-400 font-bold">
          🐀 Módulo Bioseguridad Activo
        </div>
        <div className="h-3 w-[1px] bg-slate-800"></div>
        <div className="font-mono text-indigo-300 font-bold">
          🕒 {relojActual || 'Sincronizando...'}
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl gap-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            SoyerTech Core: Control de Plagas y Roedores 🐀
          </h1>
          <p className="text-xs text-slate-400">Plataforma Centralizada de Monitoreo de Trampas y Bioseguridad Industrial</p>
        </div>

        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1 flex-wrap justify-center">
          <button 
            onClick={() => setPestanaActiva('monitoreo')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${pestanaActiva === 'monitoreo' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            🚨 Trampas en Vivo
          </button>
          <button 
            onClick={() => setPestanaActiva('emap')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${pestanaActiva === 'emap' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            🗺️ E-Map y Calor Plagas
          </button>
          <button 
            onClick={() => setPestanaActiva('sitios')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${pestanaActiva === 'sitios' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            🏢 Sitios y Zonas
          </button>
          <button 
            onClick={() => setPestanaActiva('historial')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${pestanaActiva === 'historial' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            📂 Historial Capturas
          </button>
          <button 
            onClick={() => setPestanaActiva('estadisticas')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${pestanaActiva === 'estadisticas' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            📈 Analítica Plagas
          </button>
          <button 
            onClick={() => setPestanaActiva('settings')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${pestanaActiva === 'settings' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            ⚙️ Configuración
          </button>
        </div>

        <button 
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-red-600/20"
        >
          Cerrar Sesión
        </button>
      </header>

      {/* VISTA: CONFIGURACIÓN MANUAL DE HORA */}
      {pestanaActiva === 'settings' && (
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">⚙️ Sincronización Manual de Reloj</h2>
            <p className="text-xs text-slate-400">Ingresa la hora exacta que marca tu reloj en este momento para corregir cualquier desfase con el servidor.</p>
          </div>

          {mensajeSettings && (
            <div className="bg-emerald-500/10 border border-emerald-500 text-emerald-400 p-3 rounded-lg text-xs text-center font-semibold">
              {mensajeSettings}
            </div>
          )}

          <form onSubmit={calcularDesfaseManual} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-xs font-medium mb-1">Hora Actual de tu Reloj (Formato 24 Horas)</label>
              <input 
                type="time" 
                name="horaObjetivo"
                defaultValue={new Date().toTimeString().substring(0, 5)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono font-bold"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg text-xs transition shadow-lg shadow-indigo-600/30"
            >
              Sincronizar Hora Manualmente
            </button>
          </form>
        </div>
      )}

      {/* VISTA: ESTADÍSTICAS Y ANALÍTICA DE ROEDORES CON FILTRO POR CEDIS */}
      {pestanaActiva === 'estadisticas' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">📈 Panel Analítico de Control de Plagas</h2>
              <p className="text-xs text-slate-400">Frecuencia de activaciones y capturas por trampa y CEDIS.</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300 font-medium">Filtrar por CEDIS:</span>
              <select
                value={cedisEstadisticasFiltro}
                onChange={(e) => setCedisEstadisticasFiltro(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
              >
                <option value="">🌐 Todos los CEDIS (Global)</option>
                {sitiosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">
                Trampas con Más Actividad / Capturas {cedisEstadisticasFiltro ? `en ${cedisEstadisticasFiltro}` : ''}
              </h3>
              <div className="h-72 w-full">
                {datosGraficaDispositivos.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">No hay registros suficientes</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGraficaDispositivos}>
                      <XAxis dataKey="dispositivo" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px', color: '#fff' }} />
                      <Bar dataKey="eventos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                Distribución de Capturas por Sitio / CEDIS
              </h3>
              <div className="h-72 w-full flex items-center justify-center">
                {datosGraficaSitios.length === 0 ? (
                  <div className="text-xs text-slate-500">No hay registros suficientes</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosGraficaSitios}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        fontSize={10}
                      >
                        {datosGraficaSitios.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORES_PIE[index % COLORES_PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* TABLA COMPLEMENTARIA DE TRAMPAS */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-wider">
              📋 Bitácora Analítica de Trampas y Roedores {cedisEstadisticasFiltro ? `en ${cedisEstadisticasFiltro}` : '(Global)'}
            </h3>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 sticky top-0">
                    <th className="p-3 font-semibold">ID Captura</th>
                    <th className="p-3 font-semibold">Trampa / Dispositivo</th>
                    <th className="p-3 font-semibold">Estatus</th>
                    <th className="p-3 font-semibold">CEDIS / Sitio</th>
                    <th className="p-3 font-semibold">Área</th>
                    <th className="p-3 font-semibold">Sub-área</th>
                    <th className="p-3 font-semibold text-right">Fecha y Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historialEstadisticasFiltrado.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-slate-500 italic">No hay registros para este sitio.</td>
                    </tr>
                  ) : (
                    historialEstadisticasFiltrado.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 font-mono text-indigo-400">{ev.id_foto || 'N/A'}</td>
                        <td className="p-3 font-bold text-white">{ev.dispositivo}</td>
                        <td className="p-3">
                          <span className="bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase animate-pulse">
                            🔴 Disparada / Captura
                          </span>
                        </td>
                        <td className="p-3 text-slate-300">{ev.cedis}</td>
                        <td className="p-3 text-slate-300">{ev.zona}</td>
                        <td className="p-3 text-slate-300">{ev.subzona}</td>
                        <td className="p-3 font-mono text-slate-400 text-right">{formatearFechaHora(ev.timestamp)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 1: ADMINISTRACIÓN */}
      {pestanaActiva === 'sitios' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl h-fit">
            <h2 className="text-lg font-bold text-white mb-1">
              {editandoKey ? '✏️ Editar / Reasignar Trampa' : '➕ Registrar Nueva Trampa'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              {editandoKey ? `Modificando: ${editandoKey}` : 'Organiza tus trampas de roedores por Sitio, Área y Sub-área.'}
            </p>

            {mensajeForm && (
              <div className="bg-slate-800 border border-slate-700 text-xs p-3 rounded-lg mb-4 text-center">
                {mensajeForm}
              </div>
            )}

            <form onSubmit={guardarEstructura} className="space-y-3">
              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Sitio / CEDIS</label>
                <select
                  value={formJerarquia.cedis}
                  onChange={(e) => setFormJerarquia({...formJerarquia, cedis: e.target.value, zona: '', subzona: ''})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar sitio existente --</option>
                  {sitiosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input 
                  type="text" 
                  value={formJerarquia.cedis} 
                  onChange={(e) => setFormJerarquia({...formJerarquia, cedis: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="O escribe un nuevo Sitio..."
                  required 
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Área / Pasillo</label>
                <select
                  value={formJerarquia.zona}
                  onChange={(e) => setFormJerarquia({...formJerarquia, zona: e.target.value, subzona: ''})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar área de este CEDIS --</option>
                  {areasDelSitioActual.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input 
                  type="text" 
                  value={formJerarquia.zona} 
                  onChange={(e) => setFormJerarquia({...formJerarquia, zona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="O escribe una nueva Área..."
                  required 
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Sub-área / Sección</label>
                <select
                  value={formJerarquia.subzona}
                  onChange={(e) => setFormJerarquia({...formJerarquia, subzona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar sub-área de este CEDIS --</option>
                  {subareasDelSitioActual.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
                <input 
                  type="text" 
                  value={formJerarquia.subzona} 
                  onChange={(e) => setFormJerarquia({...formJerarquia, subzona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="O escribe una nueva Sub-área..."
                  required 
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">ID o Nombre de la Trampa / Sensor</label>
                <input 
                  type="text" 
                  value={formJerarquia.dispositivo} 
                  onChange={(e) => setFormJerarquia({...formJerarquia, dispositivo: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Ej. Trampa_Anden_04"
                  required 
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow-lg shadow-emerald-600/20"
                >
                  {editandoKey ? 'Actualizar Trampa' : 'Guardar Trampa'}
                </button>
                {editandoKey && (
                  <button 
                    type="button" 
                    onClick={() => { setEditandoKey(null); setFormJerarquia({ cedis: '', zona: '', subzona: '', dispositivo: '' }); }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2.5 rounded-lg text-sm transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
            <h2 className="text-lg font-bold text-white">Explorador de Sitios y Trampas</h2>
            
            {sitiosUnicos.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl text-xs">
                No hay Sitios configurados. Usa el formulario de la izquierda.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">🏢 Sitios / CEDIS</h3>
                    {sitiosUnicos.map((sitio) => (
                      <button
                        key={sitio}
                        onClick={() => setSitioSeleccionado(sitio)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition flex justify-between items-center ${sitioSeleccionado === sitio ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
                      >
                        <span>{sitio}</span>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full">
                          {Object.values(camarasGuardadas).filter(c => c.cedis === sitio).length} trampas
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="md:col-span-2 bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-2 gap-2">
                      <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        📂 Estructura en: {sitioSeleccionado || 'Selecciona un Sitio'}
                      </h3>
                      {sitioSeleccionado && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => abrirPopupEdicionSitio(sitioSeleccionado)}
                            className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition shadow-md flex items-center gap-1"
                          >
                            ✏️ Editar Estructura
                          </button>
                          
                          <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                            Total: {totalDispositivosCedis} Trampas
                          </span>
                          <button 
                            onClick={() => agregarDirectoInCedis(sitioSeleccionado)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition shadow-md shadow-emerald-600/20 flex items-center gap-1"
                          >
                            ➕ Agregar aquí
                          </button>
                        </div>
                      )}
                    </div>

                    {!sitioSeleccionado ? (
                      <div className="text-center py-12 text-slate-600 text-xs italic">
                        Selecciona un Sitio de la izquierda para desplegar sus áreas y trampas.
                      </div>
                    ) : Object.keys(estructuraActual).length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        Este Sitio aún no tiene zonas registradas.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {Object.entries(estructuraActual).map(([area, subareas]) => {
                          const totalCamsArea = Object.values(subareas).reduce((acc, cams) => acc + cams.length, 0);
                          const areaAbierta = areasExpandidas[area];

                          return (
                            <div key={area} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                              <div 
                                onClick={() => toggleArea(area)}
                                className="p-3 bg-slate-900 hover:bg-slate-800/80 cursor-pointer flex justify-between items-center transition"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-indigo-400">📍 Área: {area}</span>
                                  <span className="bg-indigo-500/10 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/20 font-semibold">
                                    {totalCamsArea} {totalCamsArea === 1 ? 'dispositivo' : 'dispositivos'}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 font-bold">{areaAbierta ? '▼ Ocultar' : '▶ Ver Sub-áreas'}</span>
                              </div>

                              {areaAbierta && (
                                <div className="p-3 bg-slate-950 border-t border-slate-800 space-y-2.5">
                                  {Object.entries(subareas).map(([subarea, camaras]) => {
                                    const subareaKey = `${area}-${subarea}`;
                                    const subareaAbierta = subareasExpandidas[subareaKey];

                                    return (
                                      <div key={subarea} className="bg-slate-900/80 border border-slate-800/80 rounded-lg overflow-hidden">
                                        <div 
                                          onClick={() => toggleSubarea(subareaKey)}
                                          className="p-2.5 hover:bg-slate-800/50 cursor-pointer flex justify-between items-center transition"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-200 font-medium">↳ Sub-área: <strong className="text-white">{subarea}</strong></span>
                                            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                              {camaras.length} {camaras.length === 1 ? 'trampa' : 'trampas'}
                                            </span>
                                          </div>
                                          <span className="text-[10px] text-slate-400">{subareaAbierta ? '▲ Contraer' : '▼ Ver Trampas'}</span>
                                        </div>

                                        {subareaAbierta && (
                                          <div className="p-2.5 bg-black/40 border-t border-slate-800/60 space-y-2">
                                            {camaras.map((cam) => (
                                              <div key={cam.key} className="bg-slate-900 border border-slate-800 p-2.5 rounded-md flex justify-between items-center text-xs">
                                                <div className="space-y-0.5">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-red-400">🐀</span>
                                                    <span className="font-bold text-white">{cam.dispositivo}</span>
                                                  </div>
                                                  <div className="text-[10px] font-mono text-indigo-300">
                                                    📌 {cam.cedis} / {cam.zona} / {cam.subzona} / {cam.dispositivo}
                                                  </div>
                                                </div>
                                                <div className="flex gap-1.5">
                                                  <button 
                                                    onClick={() => iniciarEdicion(cam.key, cam)}
                                                    className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 px-2.5 py-1 rounded text-[10px] font-semibold transition"
                                                  >
                                                    ✏️ Editar
                                                  </button>
                                                  <button 
                                                    onClick={() => eliminarUbicacion(cam.key)}
                                                    className="bg-red-600/20 hover:bg-red-600/40 text-red-300 px-2.5 py-1 rounded text-[10px] font-semibold transition"
                                                  >
                                                    🗑️ Eliminar
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 2: E-MAP Y CALOR DE PLAGAS */}
      {pestanaActiva === 'emap' && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-4 gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">🗺️ E-Map y Mapa de Calor de Roedores por CEDIS</h2>
              <p className="text-xs text-slate-400">Identifica visualmente los puntos críticos e incidencia de plagas en la planta.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setModoMapaCalor(!modoMapaCalor)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5 ${modoMapaCalor ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {modoMapaCalor ? '🔥 Desactivar Zonas Calientes' : '🔥 Activar Zonas Calientes (Hotspots)'}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-medium">Sitio:</span>
                <select
                  value={emapSitioActual}
                  onChange={(e) => {
                    setEmapSitioActual(e.target.value);
                    setZoomLevel(1);
                    setCamaraSeleccionadaEmap(null);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  {sitiosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <form onSubmit={subirPlanoServidor} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="w-full md:w-2/3">
              <label className="block text-xs text-slate-300 font-medium mb-1">Subir Imagen del Plano (Planta / Almacén)</label>
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setArchivoPlano(e.target.files[0])}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
              />
            </div>
            <button
              type="submit"
              className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-md self-end"
            >
              📤 Subir y Guardar Plano
            </button>
          </form>

          {camaraSeleccionadaEmap && (
            <div className="bg-amber-500/10 border border-amber-500/40 text-amber-300 p-3 rounded-xl text-xs flex justify-between items-center animate-pulse">
              <span>🎯 Haz clic en cualquier lugar exacto del plano para posicionar la trampa seleccionada.</span>
              <button onClick={() => setCamaraSeleccionadaEmap(null)} className="underline font-bold">Cancelar</button>
            </div>
          )}

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="w-full md:w-1/2">
              <label className="block text-xs text-indigo-400 font-bold mb-1">🐀 Seleccionar Trampa para Colocar en el Plano:</label>
              <select
                value={camaraSeleccionadaEmap || ''}
                onChange={(e) => setCamaraSeleccionadaEmap(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
              >
                <option value="" disabled>-- Elige una trampa del listado --</option>
                {Object.entries(camarasGuardadas)
                  .filter(([_, cam]) => cam.cedis === emapSitioActual)
                  .map(([key, cam]) => {
                    const tienePos = emapPosiciones[key];
                    const nomenclaturaAuto = `${cam.cedis} / ${cam.zona} / ${cam.subzona} / ${cam.dispositivo}`;
                    return (
                      <option key={key} value={key}>
                        {nomenclaturaAuto} {tienePos ? ' [📍 Posición OK]' : ' [⚠️ Sin Ubicación]'}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-auto relative min-h-[500px] flex items-center justify-center p-6">
            
            {planoActualCedis && (
              <div className="absolute top-4 right-4 z-30 bg-slate-900/90 backdrop-blur-md border border-slate-700 px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-3">
                <span className="text-[11px] text-slate-300 font-semibold">🔍 Zoom: {Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.25))} className="bg-slate-800 hover:bg-slate-700 text-white px-2 py-0.5 rounded text-xs font-bold transition">-</button>
                <button onClick={() => setZoomLevel(1)} className="text-[10px] text-indigo-400 hover:underline font-medium">Reset</button>
                <button onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))} className="bg-slate-800 hover:bg-slate-700 text-white px-2 py-0.5 rounded text-xs font-bold transition">+</button>
              </div>
            )}

            {planoActualCedis ? (
              <div 
                onClick={manejarClickPlano}
                className="relative inline-block cursor-crosshair transition-transform duration-150 origin-center my-auto mx-auto"
                style={{ transform: `scale(${zoomLevel})` }}
              >
                <img 
                  src={planoActualCedis} 
                  alt="Plano del CEDIS" 
                  className="max-w-none object-contain select-none pointer-events-none block"
                  style={{ minWidth: '700px', maxHeight: '700px' }}
                />

                {Object.entries(camarasGuardadas)
                  .filter(([key, cam]) => cam.cedis === emapSitioActual && emapPosiciones[key])
                  .map(([key, cam]) => {
                    const pos = emapPosiciones[key];
                    const alertaEnCurso = alertas.find(a => a.keyFrigate === key || a.dispositivo === cam.dispositivo);
                    const atendida = alertasAtendidas[key];
                    const tieneCapturaActiva = alertaEnCurso && !atendida;

                    const frecuenciaCapturas = conteoEventosPorTrampa[key] || conteoEventosPorTrampa[cam.dispositivo] || 0;
                    const radioHeatmap = Math.min(130, Math.max(35, frecuenciaCapturas * 10));
                    const opacidadHeatmap = Math.min(0.9, Math.max(0.25, frecuenciaCapturas * 0.1));

                    return (
                      <div
                        key={key}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-20 flex flex-col items-center"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tieneCapturaActiva) {
                            marcarAlertaAtendida(key);
                            if (alertaEnCurso.id_foto) {
                              setImagenModal(`${FRIGATE_HTTP_URL}/api/events/${alertaEnCurso.id_foto}/snapshot.jpg`);
                            }
                          } else {
                            const alertaReciente = alertas.find(a => a.keyFrigate === key);
                            if (alertaReciente && alertaReciente.id_foto) {
                              setImagenModal(`${FRIGATE_HTTP_URL}/api/events/${alertaReciente.id_foto}/snapshot.jpg`);
                            } else {
                              setCamaraSeleccionadaEmap(key);
                            }
                          }
                        }}
                      >
                        {/* MAPA DE CALOR DE PLAGAS */}
                        {modoMapaCalor && (
                          <div 
                            className="absolute rounded-full pointer-events-none transition-all duration-500 animate-pulse"
                            style={{
                              width: `${radioHeatmap * 2}px`,
                              height: `${radioHeatmap * 2}px`,
                              background: 'radial-gradient(circle, rgba(239, 68, 68, 0.95) 0%, rgba(245, 158, 11, 0.6) 50%, rgba(239, 68, 68, 0) 80%)',
                              opacity: opacidadHeatmap,
                              transform: 'translate(-50%, -50%)',
                              left: '50%',
                              top: '50%',
                              zIndex: 10
                            }}
                          />
                        )}

                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg font-bold text-xs transition transform group-hover:scale-125 z-30 ${tieneCapturaActiva ? 'bg-red-600 text-white animate-bounce ring-4 ring-red-500/50' : 'bg-emerald-600 text-white border-2 border-white'}`}>
                          🐀
                        </div>
                        <span className="bg-slate-900/90 border border-slate-700 text-slate-200 text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap mt-0.5 font-semibold pointer-events-none z-30">
                          {cam.dispositivo}
                        </span>

                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700 text-white text-[10px] px-2.5 py-1 rounded shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-40 flex flex-col items-center">
                          <strong className="text-indigo-300 font-mono text-[9px]">{cam.cedis} / {cam.zona} / {cam.subzona} / {cam.dispositivo}</strong>
                          {tieneCapturaActiva ? (
                            <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded font-bold animate-pulse mt-0.5">🔴 ¡TRAMPA DISPARADA! Clic para revisar</span>
                          ) : (
                            <span className="text-emerald-400 text-[9px] mt-0.5">🟢 Trampa Armada / OK (Capturas: {frecuenciaCapturas})</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div 
                onClick={manejarClickPlano}
                className="text-center p-12 text-slate-500 text-xs italic cursor-crosshair w-full h-full flex flex-col items-center justify-center min-h-[500px]"
              >
                <p className="mb-2">🗺️ No hay plano de planta cargado para este CEDIS.</p>
                <p className="text-[11px] text-slate-400">Sube una imagen del plano para ubicar las trampas de roedores.</p>
              </div>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center justify-between">
              <span>📊 Estatus de Trampas en: {emapSitioActual}</span>
              <span className="text-[10px] text-slate-400 font-normal">🟢 Armada (OK) / 🔴 Disparada (Captura)</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                    <th className="p-3 font-semibold">Trampa / Sensor</th>
                    <th className="p-3 font-semibold">Ubicación Completa (CEDIS / Área / Sub-área / ID)</th>
                    <th className="p-3 font-semibold text-center">Estatus Bioseguridad</th>
                    <th className="p-3 font-semibold text-center">Acción Operativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {Object.entries(camarasGuardadas)
                    .filter(([_, cam]) => cam.cedis === emapSitioActual)
                    .map(([key, cam]) => {
                      const alertaEnCurso = alertas.find(a => a.keyFrigate === key || a.dispositivo === cam.dispositivo);
                      const atendida = alertasAtendidas[key];
                      const tieneCapturaActiva = alertaEnCurso && !atendida;
                      const nomenclaturaCompleta = `${cam.cedis} / ${cam.zona} / ${cam.subzona} / ${cam.dispositivo}`;

                      return (
                        <tr 
                          key={key} 
                          className={`transition ${tieneCapturaActiva ? 'bg-red-500/15 animate-pulse' : 'hover:bg-slate-900/50'}`}
                        >
                          <td className="p-3 font-bold text-white flex items-center gap-2">
                            <span className="text-red-400">🐀</span> {cam.dispositivo}
                          </td>
                          <td className="p-3 font-mono text-indigo-300 text-[11px]">
                            {nomenclaturaCompleta}
                          </td>
                          <td className="p-3 text-center">
                            {tieneCapturaActiva ? (
                              <span className="bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider animate-bounce inline-block">
                                🔴 ¡TRAMPA DISPARADA!
                              </span>
                            ) : (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-1 rounded-full inline-block">
                                🟢 Armada (OK)
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {tieneCapturaActiva ? (
                              <button
                                onClick={() => {
                                  marcarAlertaAtendida(key);
                                  if (alertaEnCurso.id_foto) {
                                    setImagenModal(`${FRIGATE_HTTP_URL}/api/events/${alertaEnCurso.id_foto}/snapshot.jpg`);
                                  }
                                }}
                                className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow transition"
                              >
                                🔍 Atender Captura
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">Sin actividad reciente</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* VISTA 3: MONITOREO EN VIVO DE TRAMPAS */}
      {pestanaActiva === 'monitoreo' && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center justify-between">
            <span>🚨 Alertas de Trampas Activas en Tiempo Real</span>
            <span className="bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full border border-red-500/30 font-bold animate-pulse">
              {alertas.length} Capturas Recibidas
            </span>
          </h2>

          {alertas.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Monitoreando sensores de trampas de roedores... Sin activaciones recientes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alertas.map((alerta, index) => {
                const urlSnapshot = alerta.id_foto 
                  ? `${FRIGATE_HTTP_URL}/api/events/${alerta.id_foto}/snapshot.jpg` 
                  : null;

                const camaraRegistrada = camarasGuardadas[alerta.keyFrigate];
                const noAsignada = !camaraRegistrada || camaraRegistrada.cedis === 'No agregada' || camaraRegistrada.zona === 'No agregada';

                return (
                  <div key={index} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg border-l-4 border-l-red-500">
                    <div className="bg-slate-900 p-3 border-b border-slate-800 flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-1">
                          <span>🐀</span> {alerta.dispositivo}
                        </h3>
                        <p className="text-xs text-slate-400">{alerta.cedis} / {alerta.zona} / {alerta.subzona}</p>
                      </div>
                      <span className="bg-red-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                        DISPARADA
                      </span>
                    </div>
                    
                    <div 
                      onClick={() => urlSnapshot && setImagenModal(urlSnapshot)}
                      className="bg-black h-48 flex items-center justify-center relative cursor-pointer group overflow-hidden"
                    >
                      {urlSnapshot ? (
                        <>
                          <img 
                            src={urlSnapshot} 
                            alt="Sensor Snapshot" 
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-xs text-white font-bold">
                            🔍 Ver Evidencia Fotográfica
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-600 text-xs text-center">
                          [ Sin Evidencia Fotográfica ]
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-slate-900 flex justify-between items-center border-t border-slate-800">
                      <div className="text-xs">
                        <span className="text-slate-500 mr-1">ID Captura:</span>
                        <span className="font-mono text-slate-300">{alerta.id_foto || 'N/A'}</span>
                      </div>
                      {noAsignada && (
                        <button 
                          onClick={() => abrirModalAsignacion(alerta.keyFrigate || alerta.dispositivo)}
                          className="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow animate-pulse transition flex items-center gap-1"
                        >
                          ⚙ Asignar Zona
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VISTA 4: HISTORIAL DE CAPTURAS */}
      {pestanaActiva === 'historial' && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-4 gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Historial de Capturas de Roedores</h2>
              <p className="text-xs text-slate-400">Consulta los registros de auditoría industrial, filtra y exporta reportes de bioseguridad.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={borrarHistorialDB}
                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 px-3 py-2 rounded-xl text-xs font-semibold transition shadow-lg flex items-center gap-1.5"
              >
                🗑️ Borrar Historial
              </button>

              <button
                onClick={() => setModalExportarAbierto(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
              >
                📊 Descargar Reporte CSV
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-medium">Rango:</span>
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
                  {[20, 30, 40].map((dias) => (
                    <button
                      key={dias}
                      onClick={() => setHistorialDias(dias)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${historialDias === dias ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      {dias}D
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Filtrar por CEDIS / Sitio</label>
              <select
                value={filtroCedis}
                onChange={(e) => { setFiltroCedis(e.target.value); setFiltroZona(''); setFiltroSubzona(''); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Todos los CEDIS</option>
                {cedisHistorialUnicos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Filtrar por Área</label>
              <select
                value={filtroZona}
                onChange={(e) => { setFiltroZona(e.target.value); setFiltroSubzona(''); }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                disabled={!filtroCedis && cedisHistorialUnicos.length > 1}
              >
                <option value="">Todas las Áreas</option>
                {zonasHistorialUnicas.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Filtrar por Sub-área</label>
              <select
                value={filtroSubzona}
                onChange={(e) => setFiltroSubzona(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                disabled={!filtroZona}
              >
                <option value="">Todas las Sub-áreas</option>
                {subzonasHistorialUnicas.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Buscar Trampa / Sensor</label>
              <input
                type="text"
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="Ej. Trampa_04..."
              />
            </div>
          </div>

          {cargandoHistorial ? (
            <div className="text-center py-16 text-slate-400 text-xs animate-pulse">
              Consultando base de datos SQLite...
            </div>
          ) : historialFiltrado.length === 0 ? (
            <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-xl text-xs">
              No hay registros de capturas con los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2">
              <div className="flex justify-between items-center text-xs text-slate-400 font-semibold mb-2">
                <span>Mostrando {historialFiltrado.length} de {listaHistorial.length} registros totales:</span>
                {(filtroCedis || filtroZona || filtroSubzona || filtroBusqueda) && (
                  <button 
                    onClick={() => { setFiltroCedis(''); setFiltroZona(''); setFiltroSubzona(''); setFiltroBusqueda(''); }}
                    className="text-indigo-400 hover:text-indigo-300 underline text-[11px]"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {historialFiltrado.map((evento) => {
                const urlSnapshot = evento.id_foto 
                  ? `${FRIGATE_HTTP_URL}/api/events/${evento.id_foto}/snapshot.jpg` 
                  : null;

                const noAsignada = evento.cedis === 'No agregada' || evento.zona === 'No agregada';
                const nomenclaturaEvento = `${evento.cedis} / ${evento.zona} / ${evento.subzona} / ${evento.dispositivo}`;
                const fechaAjustada = formatearFechaHora(evento.timestamp);

                return (
                  <div key={evento.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div 
                        onClick={() => urlSnapshot && setImagenModal(urlSnapshot)}
                        className="w-24 h-16 bg-black rounded-lg border border-slate-800 overflow-hidden flex-shrink-0 cursor-pointer relative group flex items-center justify-center"
                      >
                        {urlSnapshot ? (
                          <>
                            <img 
                              src={urlSnapshot} 
                              alt="Sensor Snapshot" 
                              className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[10px] text-white font-bold">
                              🔍 Ver
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-600 text-center px-1">Sin Foto</span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-400 text-sm">{evento.dispositivo}</span>
                          <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Disparada
                          </span>
                          {noAsignada && (
                            <button 
                              onClick={() => abrirModalAsignacion(evento.keyFrigate || evento.dispositivo)}
                              className="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow animate-pulse flex items-center gap-1 transition"
                            >
                              ⚙ Asignar Zona
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-indigo-300">
                          📌 {nomenclaturaEvento}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end md:self-center">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500">Fecha y Hora:</div>
                        <div className="font-mono text-slate-300 text-xs">{fechaAjustada}</div>
                      </div>
                      <div className="text-right bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-500">ID Captura:</div>
                        <div className="font-mono text-indigo-300 text-xs">{evento.id_foto || 'N/A'}</div>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL PARA SELECCIONAR RANGO DE FECHA Y HORA DE EXPORTACIÓN */}
      {modalExportarAbierto && (
        <div 
          onClick={() => setModalExportarAbierto(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full relative space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Exportar Historial a CSV</h3>
                <p className="text-[11px] text-slate-400">Selecciona el rango de fecha y hora para el reporte de auditoría.</p>
              </div>
              <button 
                onClick={() => setModalExportarAbierto(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={confirmarExportacionExcel} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Fecha Inicio</label>
                  <input 
                    type="date" 
                    value={rangoExportar.fechaInicio} 
                    onChange={(e) => setRangoExportar({...rangoExportar, fechaInicio: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Hora Inicio</label>
                  <input 
                    type="time" 
                    value={rangoExportar.horaInicio} 
                    onChange={(e) => setRangoExportar({...rangoExportar, horaInicio: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Fecha Fin</label>
                  <input 
                    type="date" 
                    value={rangoExportar.fechaFin} 
                    onChange={(e) => setRangoExportar({...rangoExportar, fechaFin: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Hora Fin</label>
                  <input 
                    type="time" 
                    value={rangoExportar.horaFin} 
                    onChange={(e) => setRangoExportar({...rangoExportar, horaFin: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required 
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs transition shadow-lg"
                >
                  Descargar Reporte CSV
                </button>
                <button 
                  type="button" 
                  onClick={() => setModalExportarAbierto(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-xs transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA AMPLIAR LA EVIDENCIA */}
      {imagenModal && (
        <div 
          onClick={() => setImagenModal(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl max-w-2xl w-full relative space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200">Evidencia de Captura (Sensor / Cámara)</span>
              <button 
                onClick={() => setImagenModal(null)}
                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-0.5 rounded text-xs font-bold"
              >
                ✕ Cerrar
              </button>
            </div>
            <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center max-h-[70vh]">
              <img src={imagenModal} alt="Evidencia ampliada" className="max-w-full max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP: EDITAR ESTRUCTURA DEL SITIO */}
      {sitioEditandoPopup && (
        <div 
          onClick={() => setSitioEditandoPopup(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full relative space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">✏️ Editar Estructura de Zonas</h3>
                <p className="text-[11px] text-indigo-400 font-mono">Sitio Actual: {sitioEditandoPopup}</p>
              </div>
              <button 
                onClick={() => setSitioEditandoPopup(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={guardarPopupEstructura} className="space-y-3">
              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Renombrar Sitio / CEDIS</label>
                <input 
                  type="text"
                  value={formPopupEstructura.nuevoCedis}
                  onChange={(e) => setFormPopupEstructura({...formPopupEstructura, nuevoCedis: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Seleccionar Área a Modificar</label>
                <select
                  value={formPopupEstructura.zonaActual}
                  onChange={(e) => setFormPopupEstructura({...formPopupEstructura, zonaActual: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar área existente --</option>
                  {zonasDelSitioPopup.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <input 
                  type="text"
                  value={formPopupEstructura.nuevaZona}
                  onChange={(e) => setFormPopupEstructura({...formPopupEstructura, nuevaZona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Nuevo nombre para esta Área..."
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Seleccionar Sub-área a Modificar</label>
                <select
                  value={formPopupEstructura.subzonaActual}
                  onChange={(e) => setFormPopupEstructura({...formPopupEstructura, subzonaActual: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar sub-área existente --</option>
                  {subzonasDelSitioPopup.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
                <input 
                  type="text"
                  value={formPopupEstructura.nuevaSubzona}
                  onChange={(e) => setFormPopupEstructura({...formPopupEstructura, nuevaSubzona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Nuevo nombre para esta Sub-área..."
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button 
                  type="submit" 
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-lg text-xs transition shadow-lg"
                >
                  Actualizar Estructura Masiva
                </button>
                <button 
                  type="button" 
                  onClick={() => setSitioEditandoPopup(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-xs transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ASIGNACIÓN RÁPIDA DE TRAMPAS */}
      {camaraParaAsignar && (
        <div 
          onClick={() => setCamaraParaAsignar(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full relative space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Asignar o Registrar Trampa de Roedores</h3>
              </div>
              <button 
                onClick={() => setCamaraParaAsignar(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={guardarAsignacionRapida} className="space-y-3">
              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Sitio / CEDIS</label>
                <select
                  value={formAsignacionRapida.cedis}
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, cedis: e.target.value, zona: '', subzona: ''})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar sitio existente --</option>
                  {sitiosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input 
                  type="text"
                  value={formAsignacionRapida.cedis}
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, cedis: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="O escribe un nuevo Sitio..."
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Área / Pasillo</label>
                <select
                  value={formAsignacionRapida.zona}
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, zona: e.target.value, subzona: ''})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar área de este CEDIS --</option>
                  {areasDelModal.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input 
                  type="text"
                  value={formAsignacionRapida.zona}
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, zona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="O escribe una nueva Área..."
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Sub-área / Sección</label>
                <select
                  value={formAsignacionRapida.subzona}
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, subzona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                >
                  <option value="">-- Seleccionar sub-área de este CEDIS --</option>
                  {subareasDelModal.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
                <input 
                  type="text"
                  value={formAsignacionRapida.subzona}
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, subzona: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="O escribe una nueva Sub-área..."
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Nombre Descriptivo de la Trampa</label>
                <input 
                  type="text" 
                  value={formAsignacionRapida.dispositivo} 
                  onChange={(e) => setFormAsignacionRapida({...formAsignacionRapida, dispositivo: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Ej. Trampa Andén 2"
                  required 
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs transition shadow-lg"
                >
                  Guardar y Asignar
                </button>
                <button 
                  type="button" 
                  onClick={() => setCamaraParaAsignar(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-xs transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;