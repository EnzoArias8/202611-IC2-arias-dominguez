'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import mqtt from 'mqtt'
import { AlertTriangle, Bell, CheckCircle2, ChefHat, Cloud, DoorClosed, DoorOpen, Flame, Gauge, Snowflake, Thermometer, Utensils, Volume2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

type SensorState = { ambient: number; humidity: number; fridge: number; oven: number; gas: number; doorOpen: boolean }
type AlertItem = { id: number; tone: 'danger' | 'warning'; title: string; detail: string; time: string }

// Inicializamos en 0 hasta que llegue el primer dato real del servidor
const initialSensors: SensorState = { ambient: 0, humidity: 0, fridge: 0, oven: 0, gas: 0, doorOpen: false }

function SensorCard({ icon: Icon, label, value, unit, detail, tone = 'green', children }: { icon: typeof Thermometer; label: string; value: string; unit?: string; detail: string; tone?: 'green' | 'blue' | 'orange' | 'red'; children?: React.ReactNode }) {
  return (
    <Card className={`kitchen-card card-${tone}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-5">
        <div className="flex items-center gap-3">
          <div className="kitchen-icon"><Icon aria-hidden="true" /></div>
          <CardTitle className="text-base font-semibold text-card-foreground">{label}</CardTitle>
        </div>
        <span className="live-dot" aria-label="Datos en vivo" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className="kitchen-value">{value}</span>
          {unit && <span className="kitchen-unit">{unit}</span>}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
        {children}
      </CardContent>
    </Card>
  )
}

function createAlarmAudio() { 
  const sampleRate = 8000; 
  const samples = new Int16Array(sampleRate); 
  for (let index = 0; index < samples.length; index += 1) { 
    const frequency = index % 800 < 400 ? 880 : 660; 
    samples[index] = Math.round(15000 * Math.sin((2 * Math.PI * frequency * index) / sampleRate)) 
  }; 
  const buffer = new ArrayBuffer(44 + samples.length * 2); 
  const view = new DataView(buffer); 
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0))); 
  write(0, 'RIFF'); 
  view.setUint32(4, 36 + samples.length * 2, true); 
  write(8, 'WAVE'); 
  write(12, 'fmt '); 
  view.setUint32(16, 16, true); 
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true); 
  view.setUint32(28, sampleRate * 2, true); 
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  write(36, 'data'); 
  view.setUint32(40, samples.length * 2, true); 
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true)); 
  return new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))) 
}

export function MonitoringDashboard() {
  const [loading, setLoading] = useState(true); 
  const [supervising, setSupervising] = useState(false); 
  const [alarmAcknowledged, setAlarmAcknowledged] = useState(false); 
  const [sensors, setSensors] = useState(initialSensors); 
  const [now, setNow] = useState(new Date()); 
  const [alerts, setAlerts] = useState<AlertItem[]>([]); 
  const [alertsOpen, setAlertsOpen] = useState(false); 
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reloj y pantalla de carga
  useEffect(() => { 
    const loader = window.setTimeout(() => setLoading(false), 2500); 
    const clock = window.setInterval(() => setNow(new Date()), 1000); 
    return () => { window.clearTimeout(loader); window.clearInterval(clock); } 
  }, []);

  // CONEXIÓN MQTT A DEBIAN
  useEffect(() => {
    // Nos conectamos al servidor MQTT por WebSockets (puerto 9001)
    const client = mqtt.connect('ws://192.168.0.84:9001');

    client.on('connect', () => {
      console.log('✅ Dashboard conectado a Mosquitto (Debian)');
      client.subscribe('proyecto/#'); // Suscripción a todos los sensores
    });

    client.on('message', (topic, message) => {
      const valorStr = message.toString();
      const valorNum = parseFloat(valorStr);

      setSensors((current) => {
        const nuevosDatos = { ...current };
        switch (topic) {
          case 'proyecto/temperatura': nuevosDatos.ambient = valorNum; break;
          case 'proyecto/humedad': nuevosDatos.humidity = valorNum; break;
          case 'proyecto/gas': nuevosDatos.gas = valorNum; break;
          case 'proyecto/temperatura_industrial': nuevosDatos.oven = valorNum; break;
          case 'proyecto/temperatura_sumergible': nuevosDatos.fridge = valorNum; break;
          case 'proyecto/puerta': nuevosDatos.doorOpen = (valorStr === "Abierta"); break;
        }
        return nuevosDatos;
      });
    });

    return () => { client.end(); }
  }, []);

  // Variables de estado crítico basadas en datos reales
  const fridgeCritical = sensors.fridge > 8; 
  const gasCritical = sensors.gas > 65; 
  const dangerActive = supervising && gasCritical; 
  const statusText = useMemo(() => sensors.doorOpen ? 'ABIERTA' : 'CERRADA', [sensors.doorOpen]);

  // Generador de alertas reales según umbrales
  useEffect(() => {
    if (!supervising) return;
    
    if (gasCritical) {
      setAlerts(current => {
        if (current.length > 0 && current[0].title.includes('fuga de gas')) return current;
        return [{ id: Date.now(), tone: 'danger', title: 'PELIGRO: fuga de gas detectada', detail: 'Nivel crítico detectado en sensor MQ', time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }, ...current].slice(0, 4);
      });
    }

    if (fridgeCritical) {
      setAlerts(current => {
        if (current.length > 0 && current[0].title.includes('cadena de frío')) return current;
        return [{ id: Date.now(), tone: 'warning', title: 'Advertencia: cadena de frío', detail: 'Temperatura de cámara superó los 8°C', time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }, ...current].slice(0, 4);
      });
    }
  }, [gasCritical, fridgeCritical, supervising]);

  // Sistema de alarma de audio
  useEffect(() => { 
    if (!dangerActive || alarmAcknowledged) { 
      audioRef.current?.pause(); 
      if (audioRef.current) audioRef.current.currentTime = 0; 
      return 
    }; 
    const audio = createAlarmAudio(); 
    audio.loop = true; 
    audioRef.current = audio; 
    audio.play().catch(() => undefined); 
    return () => { audio.pause(); URL.revokeObjectURL(audio.src); audioRef.current = null } 
  }, [dangerActive, alarmAcknowledged]);

  if (loading) return <main className="loading-screen"><div className="loading-mark"><Utensils aria-hidden="true" /><span /></div><p>Conectando con ESP32s y Servidor Debian...</p><div className="loading-track"><span /></div></main>
  
  if (!supervising) return <main className="supervision-gate"><div className="gate-panel"><div className="brand-icon"><ChefHat aria-hidden="true" /></div><p className="eyebrow text-primary">SMART KITCHEN · CONTROL CENTRAL</p><h1>Iniciar supervisión de cocina</h1><p>Activa la vigilancia en tiempo real para recibir alarmas visuales y sonoras ante cualquier condición crítica.</p><Button size="lg" onClick={() => setSupervising(true)}><Volume2 data-icon="inline-start" /> Iniciar Supervisión de Cocina</Button><span className="gate-note">Audio de alarmas habilitado al iniciar</span></div></main>
  
  return (
    <main className={`kitchen-shell ${dangerActive && !alarmAcknowledged ? 'alarm-active' : ''}`}>
      <div className="kitchen-pattern" aria-hidden="true" />
      {dangerActive && !alarmAcknowledged && 
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="alert" aria-live="assertive">
          <div className="alarm-banner w-full max-w-2xl text-center">
            <div className="flex flex-col items-center gap-3">
              <strong>PELIGRO · FUGA DE GAS</strong>
              <span>Evacúe el sector cocción y revise el detector inmediatamente.</span>
            </div>
            <Button variant="destructive" size="lg" className="mt-7 min-h-14 w-full text-base" onClick={() => setAlarmAcknowledged(true)}>SILENCIAR ALARMA</Button>
          </div>
        </div>
      }
      
      <header className="kitchen-header">
        <div className="brand-lockup">
          <div className="brand-icon"><ChefHat aria-hidden="true" /></div>
          <div><h1>Smart Kitchen - Panel de Control</h1></div>
        </div>
        <div className="header-meta">
          <Sheet open={alertsOpen} onOpenChange={setAlertsOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label={`Abrir historial de alertas (${alerts.length})`} className="bell-button" />}>
              <Bell data-icon="inline-start" />
              <Badge className="notification-badge">{alerts.length || 0}</Badge>
            </SheetTrigger>
            <SheetContent side="right" className="alerts-sheet">
              <SheetHeader>
                <SheetTitle>Alertas recientes</SheetTitle>
                <SheetDescription>Historial de eventos de seguridad de la cocina.</SheetDescription>
              </SheetHeader>
              <div className="alerts-list px-4">
                {alerts.length === 0 ? 
                  <div className="empty-alerts"><Utensils aria-hidden="true" /><p>Todo en orden</p><span>La cocina está bajo supervisión continua.</span></div> 
                  : 
                  alerts.map((alert) => 
                    <Alert key={alert.id} className={`event-alert ${alert.tone === 'danger' ? 'event-danger' : 'event-warning'}`}>
                      <AlertTriangle aria-hidden="true" />
                      <div>
                        <AlertTitle>{alert.title}</AlertTitle>
                        <AlertDescription>{alert.detail}</AlertDescription>
                        <span className="event-time">{alert.time} · Cocina central</span>
                      </div>
                    </Alert>
                  )
                }
              </div>
            </SheetContent>
          </Sheet>
          <time dateTime={now.toISOString()}>{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        </div>
      </header>
      
      <section className="kitchen-grid">
        <section className="sensor-grid grid-cols-1 md:grid-cols-3" aria-label="Sensores de la cocina">
          <SensorCard icon={Thermometer} label="Clima Cocina" value={sensors.ambient.toFixed(1)} unit="°C" detail={`${sensors.humidity.toFixed(1)}% humedad · Ambiente`} >
            <div className="mini-bar"><span style={{ width: `${sensors.humidity}%` }} /></div>
          </SensorCard>
          
          <SensorCard icon={Snowflake} label="Cámara Frigorífica" value={sensors.fridge.toFixed(1)} unit="°C" detail={fridgeCritical ? 'Riesgo en cadena de frío' : 'Temperatura de conservación óptima'} tone={fridgeCritical ? 'red' : 'blue'} />
          
          <SensorCard icon={Flame} label="Horno Principal" value={String(sensors.oven.toFixed(1))} unit="°C" detail="Ciclo de cocción · Termopar industrial" tone="orange" />
          
          <SensorCard icon={Cloud} label="Detector de Gas" value={gasCritical ? 'PELIGRO' : 'Normal'} detail={`${sensors.gas}% · Sector cocción`} tone={gasCritical ? 'red' : 'green'}>
            <Progress value={sensors.gas} className={`mt-5 ${gasCritical ? 'progress-critical' : ''}`} aria-label={`Nivel de gas ${sensors.gas}%`} />
          </SensorCard>
          
          <Card className={`kitchen-card door-card ${sensors.doorOpen ? 'door-open' : ''}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-5">
              <div className="flex items-center gap-3">
                <div className="kitchen-icon">{sensors.doorOpen ? <DoorOpen aria-hidden="true" /> : <DoorClosed aria-hidden="true" />}</div>
                <CardTitle className="text-base font-semibold">Puerta de Cámara</CardTitle>
              </div>
              <Gauge aria-hidden="true" className="status-shield" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="door-status-icon">{sensors.doorOpen ? <DoorOpen aria-hidden="true" /> : <DoorClosed aria-hidden="true" />}</span>
                <span className="kitchen-value door-value">{statusText}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{sensors.doorOpen ? 'Atención requerida · conservar alimentos' : 'Cierre magnético asegurado'}</p>
            </CardContent>
          </Card>
          
          <Card className={`kitchen-card latest-alert-card ${alerts[0]?.tone === 'danger' ? 'latest-alert-danger' : ''}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-5">
              <div className="flex items-center gap-3">
                <div className="kitchen-icon">{alerts[0] ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}</div>
                <CardTitle className="text-base font-semibold">Última Alerta</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {alerts[0] ? 
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-card-foreground">{alerts[0].title}</p>
                  <p className="text-sm text-muted-foreground">{alerts[0].detail}</p>
                  <span className="event-time">{alerts[0].time}</span>
                </div> 
                : 
                <div className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden="true" className="stable-check" />
                  <p className="text-sm font-semibold text-card-foreground">Sistema estable</p>
                </div>
              }
            </CardContent>
          </Card>
        </section>
      </section>
      
      <div className="sensor-status-footer"><span className="sensor-status">SENSORES 3/3 NODOS ACTIVOS</span></div>
    </main>
  )
}
