//+------------------------------------------------------------------+
//|                                   Asian_Range_Breakout_EA.mq5    |
//|   Estrategia: Ruptura del rango asiatico                          |
//|   1) Marca el maximo y minimo de la sesion asiatica               |
//|   2) Al terminar, coloca Buy Stop arriba y Sell Stop abajo        |
//|   3) Cuando se activa uno, cancela el otro (1 operacion por dia)  |
//|   4) SL al otro lado del rango (o a la mitad), TP en R            |
//|   5) Filtros: tamano del rango vs ATR diario, spread, tendencia   |
//|   6) Cierra todo al final del dia                                 |
//|   Todas las horas son HORA DEL SERVIDOR MT5.                      |
//|   El panel TradeBot replica esta logica y manda las entradas al  |
//|   Probador con TradeBotReplay.                                    |
//+------------------------------------------------------------------+
#property copyright "Uso personal"
#property version   "1.00"

#include <Trade\Trade.mqh>

enum ENUM_SLMODE { SL_OPPOSITE = 0,
                   SL_MIDDLE   = 1 };

input group "1. Rango asiatico (hora del servidor)"
input int    InpRangeStart    = 0;
input int    InpRangeEnd      = 9;
input int    InpTradeEnd      = 15;
input int    InpCloseHour     = 22;

input group "2. Filtros del rango"
input double InpMinRangeAtr   = 0.10;
input double InpMaxRangeAtr   = 0.60;
input double InpBufferAtr     = 0.02;
input int    InpMaxSpreadPts  = 30;
input bool   InpTrendFilter   = false;
input int    InpTrendEma      = 200;
input bool   InpMon           = true;
input bool   InpTue           = true;
input bool   InpWed           = true;
input bool   InpThu           = true;
input bool   InpFri           = true;

input group "3. Riesgo y salida"
input double InpRiskPct       = 1.0;
input ENUM_SLMODE InpSlMode   = SL_OPPOSITE;
input double InpRR            = 1.5;
input double InpBeAtR         = 1.0;
input bool   InpUsePartial    = false;
input double InpPartialR      = 1.0;
input double InpPartialPct    = 50;

input group "4. Alertas y varios"
input bool   InpAlertPopup    = true;
input bool   InpAlertPush     = false;
input bool   InpDraw          = true;
input long   InpMagic         = 260311;
input int    InpDeviation     = 20;

CTrade   trade;
int      hAtrD1 = INVALID_HANDLE, hEma = INVALID_HANDLE;
datetime g_lastBar = 0;
int      g_dayDone = -1;
double   g_rHigh = 0, g_rLow = 0;
double   g_risk0 = 0;
bool     g_beDone = false, g_partialDone = false;
ulong    g_posTicket = 0;
string   PFX = "ARB_";

void Notify(string msg)
  {
   Print(msg);
   if(MQLInfoInteger(MQL_TESTER)) return;
   if(InpAlertPopup) Alert(msg);
   if(InpAlertPush)  SendNotification(msg);
  }

double NormalizeLots(double lots)
  {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) return 0;
   return MathMin(lots, vmax);
  }

double LotsForRisk(double riskPrice)
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv <= 0) tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(ts <= 0 || tv <= 0 || riskPrice <= 0) return 0;
   double money = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPct / 100.0;
   return NormalizeLots(money / (riskPrice / ts * tv));
  }

bool DayAllowed(int dow)
  {
   switch(dow)
     {
      case 1: return InpMon;
      case 2: return InpTue;
      case 3: return InpWed;
      case 4: return InpThu;
      case 5: return InpFri;
     }
   return false;
  }

bool GetMyPosition(ulong &ticket)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic)
        { ticket = tk; return true; }
     }
   return false;
  }

int DeleteMyPendings()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == InpMagic)
         if(trade.OrderDelete(tk)) n++;
     }
   return n;
  }

int CountMyPendings()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == InpMagic) n++;
     }
   return n;
  }

void DrawRange(datetime t1, datetime t2, double hi, double lo, datetime tEnd)
  {
   if(!InpDraw) return;
   string base = PFX + TimeToString(t1, TIME_DATE);
   string box  = base + "_box";
   ObjectDelete(0, box);
   ObjectCreate(0, box, OBJ_RECTANGLE, 0, t1, hi, t2, lo);
   ObjectSetInteger(0, box, OBJPROP_COLOR, clrSteelBlue);
   ObjectSetInteger(0, box, OBJPROP_FILL, true);
   ObjectSetInteger(0, box, OBJPROP_BACK, true);
   string lh = base + "_hi", ll = base + "_lo";
   ObjectDelete(0, lh); ObjectDelete(0, ll);
   ObjectCreate(0, lh, OBJ_TREND, 0, t2, hi, tEnd, hi);
   ObjectCreate(0, ll, OBJ_TREND, 0, t2, lo, tEnd, lo);
   ObjectSetInteger(0, lh, OBJPROP_COLOR, clrLime);
   ObjectSetInteger(0, ll, OBJPROP_COLOR, clrRed);
   ObjectSetInteger(0, lh, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, ll, OBJPROP_STYLE, STYLE_DASH);
  }

void PlaceOrders(datetime dayStart)
  {
   datetime from = dayStart + InpRangeStart * 3600;
   datetime to   = dayStart + InpRangeEnd * 3600;
   if(InpRangeStart > InpRangeEnd) from -= 86400;

   MqlRates r[];
   int n = CopyRates(_Symbol, PERIOD_M5, from, to - 1, r);
   if(n < 6) { Print("Rango asiatico sin datos suficientes (", n, " velas)"); return; }
   double hi = r[0].high, lo = r[0].low;
   for(int i = 1; i < n; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
   g_rHigh = hi; g_rLow = lo;
   double range = hi - lo;

   double atrBuf[];
   if(CopyBuffer(hAtrD1, 0, 1, 1, atrBuf) < 1) return;
   double atrD = atrBuf[0];
   int dg = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   DrawRange(from, to, hi, lo, dayStart + InpTradeEnd * 3600);

   if(range < atrD * InpMinRangeAtr || range > atrD * InpMaxRangeAtr)
     {
      Print("Dia descartado: rango ", DoubleToString(range, dg), " = ", DoubleToString(range / atrD, 2), " x ATR diario");
      return;
     }
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPts) { Print("Dia descartado: spread ", spread, " > ", InpMaxSpreadPts); return; }

   bool allowBuy = true, allowSell = true;
   if(InpTrendFilter)
     {
      double ema[];
      if(CopyBuffer(hEma, 0, 1, 1, ema) == 1)
        {
         double px = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         allowBuy  = px > ema[0];
         allowSell = px < ema[0];
        }
     }

   double buf  = atrD * InpBufferAtr;
   double mid  = (hi + lo) / 2.0;
   double ask  = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid  = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double minD = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;

   if(allowBuy)
     {
      double e  = NormalizeDouble(hi + buf, dg);
      double sl = NormalizeDouble(InpSlMode == SL_MIDDLE ? mid : lo - buf, dg);
      double risk = e - sl;
      double tp = InpRR > 0 ? NormalizeDouble(e + risk * InpRR, dg) : 0;
      double lots = LotsForRisk(risk);
      if(e > ask + minD && lots > 0)
        {
         if(trade.BuyStop(lots, e, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "ARB buy"))
            Print("Buy Stop colocado en ", DoubleToString(e, dg));
        }
     }
   if(allowSell)
     {
      double e  = NormalizeDouble(lo - buf, dg);
      double sl = NormalizeDouble(InpSlMode == SL_MIDDLE ? mid : hi + buf, dg);
      double risk = sl - e;
      double tp = InpRR > 0 ? NormalizeDouble(e - risk * InpRR, dg) : 0;
      double lots = LotsForRisk(risk);
      if(e < bid - minD && lots > 0)
        {
         if(trade.SellStop(lots, e, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "ARB sell"))
            Print("Sell Stop colocado en ", DoubleToString(e, dg));
        }
     }
   Notify("Rango asiatico " + _Symbol + ": max " + DoubleToString(hi, dg) + " / min " + DoubleToString(lo, dg));
  }

void ManagePosition()
  {
   ulong tk;
   if(!GetMyPosition(tk)) { g_posTicket = 0; return; }
   if(!PositionSelectByTicket(tk)) return;

   long   type = PositionGetInteger(POSITION_TYPE);
   double e    = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl   = PositionGetDouble(POSITION_SL);
   double tp   = PositionGetDouble(POSITION_TP);
   double vol  = PositionGetDouble(POSITION_VOLUME);
   int    dg   = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   if(tk != g_posTicket)
     {
      g_posTicket = tk; g_beDone = false; g_partialDone = false;
      g_risk0 = (sl > 0) ? MathAbs(e - sl) : 0;
      int del = DeleteMyPendings();
      Notify("ARB | " + _Symbol + " | " + (type == POSITION_TYPE_BUY ? "COMPRA" : "VENTA") + " activada" +
             (del > 0 ? " (orden contraria cancelada)" : ""));
     }
   if(g_risk0 <= 0) return;

   double px   = (type == POSITION_TYPE_BUY) ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double gain = (type == POSITION_TYPE_BUY) ? (px - e) / g_risk0 : (e - px) / g_risk0;

   if(InpUsePartial && !g_partialDone && gain >= InpPartialR)
     {
      double pv = NormalizeLots(vol * InpPartialPct / 100.0);
      if(pv > 0 && vol - pv >= SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN))
         if(trade.PositionClosePartial(tk, pv)) { g_partialDone = true; Notify("ARB | cierre parcial"); }
     }
   if(InpBeAtR > 0 && !g_beDone && gain >= InpBeAtR)
     {
      double ns = NormalizeDouble(e, dg);
      bool better = (type == POSITION_TYPE_BUY) ? (ns > sl) : (sl == 0 || ns < sl);
      if(better && trade.PositionModify(tk, ns, tp)) { g_beDone = true; Notify("ARB | SL a break even"); }
      else if(!better) g_beDone = true;
     }
  }

int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviation);
   trade.SetTypeFillingBySymbol(_Symbol);
   hAtrD1 = iATR(_Symbol, PERIOD_D1, 14);
   hEma   = iMA(_Symbol, PERIOD_H1, InpTrendEma, 0, MODE_EMA, PRICE_CLOSE);
   if(hAtrD1 == INVALID_HANDLE || hEma == INVALID_HANDLE) return INIT_FAILED;
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   Comment("");
   if(!MQLInfoInteger(MQL_TESTER)) ObjectsDeleteAll(0, PFX);
  }

void OnTick()
  {
   ManagePosition();

   datetime t0 = iTime(_Symbol, _Period, 0);
   if(t0 == g_lastBar) return;
   g_lastBar = t0;

   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   datetime dayStart = (datetime)((long)now - ((long)now % 86400));

   ulong tk;
   bool hasPos = GetMyPosition(tk);

   if(dt.day_of_year != g_dayDone && dt.hour >= InpRangeEnd && dt.hour < InpTradeEnd && DayAllowed(dt.day_of_week) && !hasPos)
     {
      g_dayDone = dt.day_of_year;
      PlaceOrders(dayStart);
     }

   if(dt.hour >= InpTradeEnd && CountMyPendings() > 0)
     {
      DeleteMyPendings();
      Print("Hora limite: ordenes pendientes canceladas");
     }

   if(InpCloseHour > 0 && dt.hour >= InpCloseHour && hasPos)
     {
      trade.PositionClose(tk);
      Notify("ARB | " + _Symbol + " | Operacion cerrada por hora de cierre");
     }
  }
//+------------------------------------------------------------------+
