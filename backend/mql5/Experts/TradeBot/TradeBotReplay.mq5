//+------------------------------------------------------------------+
//| TradeBotReplay.mq5                                               |
//| Ejecuta en el Probador de Estrategias de MT5 las MISMAS entradas |
//| que generó el backtest del TradeBot, para comparar los dos       |
//| motores con los ticks reales de MT5.                             |
//|                                                                  |
//| Archivo de entrada (Common\Files\TradeBot\replay\<nombre>.csv):  |
//|   id;tiempo_servidor;side;volume;sl_dist;tp_dist;max_bars        |
//| Resultado: <nombre>_result.csv (formato TradeBotRecorder).       |
//+------------------------------------------------------------------+
#property copyright "TradeBot"
#property version   "1.00"
#property description "Repite en el Probador las entradas del backtest del TradeBot"

#include <Trade/Trade.mqh>
#include <TradeBot/TradeBotRecorder.mqh>

input string InpFile   = "TradeBot\\replay\\replay.csv"; // Archivo de entradas (Common\Files)
input long   InpMagic  = 770001;                         // Magic de las órdenes de repetición
input int    InpMaxLateBars = 1;                         // Velas de retraso permitidas para entrar

struct TBOrder
  {
   long              id;
   datetime          time;
   string            side;
   double            volume;
   double            sl_dist;
   double            tp_dist;
   int               max_bars;
  };

TBOrder g_orders[];
int     g_next = 0;
int     g_opened = 0, g_missed = 0, g_failed = 0;
CTrade  g_trade;

string ResultFile()
  {
   string name = InpFile;
   StringReplace(name, ".csv", "");
   return name + "_result.csv";
  }

bool LoadOrders()
  {
   int h = FileOpen(InpFile, FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI, '\t', CP_UTF8);
   if(h == INVALID_HANDLE)
     {
      PrintFormat("TradeBotReplay: no se encuentra Common\\Files\\%s (error %d)", InpFile, GetLastError());
      return false;
     }
   ArrayResize(g_orders, 0);
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      StringTrimLeft(line);
      StringTrimRight(line);
      if(StringLen(line) == 0 || StringGetCharacter(line, 0) == '#')
         continue;
      string f[];
      if(StringSplit(line, StringGetCharacter(";", 0), f) < 7)
         continue;
      TBOrder o;
      o.id       = StringToInteger(f[0]);
      o.time     = (datetime)StringToInteger(f[1]);
      o.side     = f[2];
      o.volume   = StringToDouble(f[3]);
      o.sl_dist  = StringToDouble(f[4]);
      o.tp_dist  = StringToDouble(f[5]);
      o.max_bars = (int)StringToInteger(f[6]);
      int k = ArraySize(g_orders);
      ArrayResize(g_orders, k + 1);
      g_orders[k] = o;
     }
   FileClose(h);
   PrintFormat("TradeBotReplay: %d entradas cargadas de %s", ArraySize(g_orders), InpFile);
   return ArraySize(g_orders) > 0;
  }

int MaxBarsFor(const string comment)
  {
   if(StringFind(comment, "tb:") != 0)
      return 0;
   long id = StringToInteger(StringSubstr(comment, 3));
   for(int i = 0; i < ArraySize(g_orders); i++)
      if(g_orders[i].id == id)
         return g_orders[i].max_bars;
   return 0;
  }

void CloseExpired()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      int max_bars = MaxBarsFor(PositionGetString(POSITION_COMMENT));
      if(max_bars <= 0)
         continue;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      if(iBarShift(_Symbol, _Period, opened) >= max_bars)
         g_trade.PositionClose(ticket);
     }
  }

void OpenDue()
  {
   datetime now = TimeCurrent();
   while(g_next < ArraySize(g_orders) && g_orders[g_next].time <= now)
     {
      TBOrder o = g_orders[g_next];
      g_next++;
      if(now - o.time > PeriodSeconds() * InpMaxLateBars)
        {
         g_missed++;
         continue; // no hubo ticks a tiempo (mercado cerrado / hueco de datos)
        }
      MqlTick tick;
      if(!SymbolInfoTick(_Symbol, tick))
        {
         g_failed++;
         continue;
        }
      int    digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      bool   buy    = o.side == "buy";
      double price  = buy ? tick.ask : tick.bid;
      double sl     = NormalizeDouble(buy ? price - o.sl_dist : price + o.sl_dist, digits);
      double tp     = o.tp_dist > 0 ? NormalizeDouble(buy ? price + o.tp_dist : price - o.tp_dist, digits) : 0.0;
      string tag    = "tb:" + IntegerToString(o.id);
      bool ok = buy ? g_trade.Buy(o.volume, _Symbol, price, sl, tp, tag)
                    : g_trade.Sell(o.volume, _Symbol, price, sl, tp, tag);
      if(ok && (g_trade.ResultRetcode() == TRADE_RETCODE_DONE || g_trade.ResultRetcode() == TRADE_RETCODE_PLACED))
         g_opened++;
      else
        {
         g_failed++;
         PrintFormat("TradeBotReplay: entrada %I64d falló: %d %s", o.id, g_trade.ResultRetcode(), g_trade.ResultComment());
        }
     }
  }

int OnInit()
  {
   if(!LoadOrders())
      return INIT_FAILED;
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(50);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   // saltar las entradas anteriores al inicio de la prueba
   datetime now = TimeCurrent();
   while(g_next < ArraySize(g_orders) && g_orders[g_next].time < now - PeriodSeconds() * InpMaxLateBars)
      g_next++;
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   CloseExpired();
   OpenDue();
  }

double OnTester()
  {
   TBR_SaveDeals(ResultFile(), InpMagic);
   PrintFormat("TradeBotReplay: abiertas %d · perdidas (sin ticks a tiempo) %d · fallidas %d",
               g_opened, g_missed, g_failed);
   return (double)g_opened;
  }

void OnDeinit(const int reason)
  {
   if(!MQLInfoInteger(MQL_TESTER))
      TBR_SaveDeals(ResultFile(), InpMagic);
  }
//+------------------------------------------------------------------+
