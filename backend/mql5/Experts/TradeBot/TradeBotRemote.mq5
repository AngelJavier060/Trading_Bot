//+------------------------------------------------------------------+
//| TradeBotRemote.mq5                                               |
//| Muestra en el gráfico las señales y el estado de un TradeBot que |
//| corre en OTRA máquina (VPS), consultando su API por HTTP.        |
//| NO opera: solo dibuja.                                           |
//|                                                                  |
//| Requisito: Herramientas > Opciones > Asesores Expertos >         |
//| "Permitir WebRequest para las URL" y añadir la URL del sistema.  |
//+------------------------------------------------------------------+
#property copyright "TradeBot"
#property version   "1.00"
#property description "Señales y estado del TradeBot remoto (solo visualización)"

#include <TradeBot/TradeBotCommon.mqh>

input string InpUrl           = "http://127.0.0.1:5000"; // URL del sistema (túnel HTTPS si es remoto)
input string InpToken         = "";                      // API_TOKEN del sistema
input bool   InpShowBlocked   = true;                    // Mostrar señales bloqueadas / filtradas
input int    InpRefreshSecond = 5;                       // Actualizar cada (segundos)

string HttpGet(const string path)
  {
   char body[], result[];
   string response_headers;
   string headers = InpToken != "" ? "X-API-Token: " + InpToken + "\r\n" : "";
   ResetLastError();
   int code = WebRequest("GET", InpUrl + path, headers, 5000, body, result, response_headers);
   if(code == -1)
     {
      PrintFormat("TradeBotRemote: WebRequest falló (error %d). Añade %s en Herramientas > Opciones > Asesores Expertos.",
                  GetLastError(), InpUrl);
      return "";
     }
   if(code != 200)
     {
      PrintFormat("TradeBotRemote: HTTP %d en %s", code, path);
      return "";
     }
   return CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
  }

void Refresh()
  {
   string status = HttpGet("/api/bridge/status.txt");
   TB_DrawPanel(status, InpUrl);
   if(status == "")
      return;
   TBSignal sigs[];
   TB_ParseSignals(HttpGet("/api/bridge/signals.txt?symbol=" + _Symbol), sigs);
   TB_DrawSignals(sigs, _Symbol, InpShowBlocked);
   ChartRedraw();
  }

int OnInit()
  {
   EventSetTimer(MathMax(2, InpRefreshSecond));
   Refresh();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, TB_PREFIX);
  }

void OnTimer()
  {
   Refresh();
  }

void OnTick()
  {
  }
//+------------------------------------------------------------------+
