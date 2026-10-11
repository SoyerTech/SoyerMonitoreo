import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const socket = io('http://10.10.2.78:3000', {
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
      setRelojActual(`${anio}-${mes}-${dia}${horas}:${minutos}:${segundos}`);
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
    setMensajeSettings(`✅ ¡Hora sincronizada con éxito! Desfase