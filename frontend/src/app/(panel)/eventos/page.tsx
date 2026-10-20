"use client";

import { useEffect, useState } from "react";
import { Card, DataTable, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";

type Event = { id: number; ts: string; event: string } & Record<string, unknown>;

export default function EventosPage() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => api<{ events: Event[] }>("/api/events?limit=300").then((r) => alive && setEvents(r.events)).catch(() => undefined);
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <>
      <PageHead title="Eventos">Diario del sistema: arranques, conexiones, órdenes, cierres, errores y alertas.</PageHead>
      <Card>
        <DataTable<Event> rows={events} rowKey={(e) => e.id} empty="Sin eventos." columns={[
          { title: "Hora", render: (e) => dateTime(e.ts) },
          { title: "Evento", render: (e) => e.event },
          { title: "Detalle", wrap: true, render: (e) => {
            const rest = Object.fromEntries(Object.entries(e).filter(([k]) => !["id", "ts", "event"].includes(k)));
            return JSON.stringify(rest).slice(0, 300);
          } },
        ]} />
      </Card>
    </>
  );
}
