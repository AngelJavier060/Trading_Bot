//+------------------------------------------------------------------+
//| TradeBotMonitor.mq5                                              |
//| Muestra en el gráfico las señales y el estado del TradeBot que   |
//| corre en ESTA máquina (lee Common\Files\TradeBot\*.txt).         |
//| Para ver el bot desde otro PC usa el EA TradeBotRemote.          |
//+------------------------------------------------------------------+
#property copyright "TradeBot"
#property version   "1.00"
#property description "Señales y estado del TradeBot (mismo equipo)"
#property indicator_chart_window
#property indicator_plots 0

#include <TradeBot/TradeBotCommon.mqh>

input bool InpShowBlocked   = true;  // Mostrar señales bloqueadas / filtradas
input int  InpRefreshSecond = 2;     // Actualizar cada (segundos)

void Refresh()
  {
   string status = TB_ReadCommonFile("TradeBot\\status.txt");
   TB_DrawPanel(status, "Common\\Files\\TradeBot");
   TBSignal sigs[];
   TB_ParseSignals(TB_ReadCommonFile("TradeBot\\signals.txt"), sigs);
   TB_DrawSignals(sigs, _Symbol, InpShowBlocked);
   ChartRedraw();
  }

int OnInit()
  {
   EventSetTimer(MathMax(1, InpRefreshSecond));
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

int OnCalculate(const int rates_total, const int prev_calculated, const int begin, const double &price[])
  {
   return rates_total;
  }
//+------------------------------------------------------------------+
