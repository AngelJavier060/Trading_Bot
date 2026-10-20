//+------------------------------------------------------------------+
//| TradeBotCommon.mqh                                               |
//| Lectura y dibujo del estado/señales publicados por el TradeBot.  |
//| Formato: ver tradebot/bridge.py                                  |
//+------------------------------------------------------------------+
#property strict

#define TB_PREFIX "TB_"

struct TBSignal
  {
   long              id;
   datetime          time;       // apertura de la vela de entrada (hora del servidor)
   string            symbol;
   string            side;       // buy | sell
   string            decision;   // opened | dry_run | blocked | rejected | ml_filtered
   double            entry;
   double            sl;
   double            tp;
   double            volume;
   double            confidence;
   string            mlprob;
   long              ticket;
   string            reason;
  };

//--- lee un archivo de texto de la carpeta común de los terminales
string TB_ReadCommonFile(const string name)
  {
   int h = FileOpen(name, FILE_READ | FILE_TXT | FILE_COMMON | FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_ANSI, '\t', CP_UTF8);
   if(h == INVALID_HANDLE)
      return "";
   string out = "";
   while(!FileIsEnding(h))
      out += FileReadString(h) + "\n";
   FileClose(h);
   return out;
  }

//--- valor de "clave=valor" dentro del texto de estado
string TB_Value(const string status, const string key, const string fallback = "-")
  {
   string lines[];
   int n = StringSplit(status, StringGetCharacter("\n", 0), lines);
   for(int i = 0; i < n; i++)
     {
      int eq = StringFind(lines[i], "=");
      if(eq > 0 && StringSubstr(lines[i], 0, eq) == key)
        {
         string v = StringSubstr(lines[i], eq + 1);
         StringTrimRight(v);
         return v;
        }
     }
   return fallback;
  }

int TB_ParseSignals(const string text, TBSignal &out[])
  {
   ArrayResize(out, 0);
   string lines[];
   int n = StringSplit(text, StringGetCharacter("\n", 0), lines);
   for(int i = 0; i < n; i++)
     {
      string line = lines[i];
      StringTrimLeft(line);
      StringTrimRight(line);
      if(StringLen(line) == 0)
         continue;
      string f[];
      if(StringSplit(line, StringGetCharacter("|", 0), f) < 13)
         continue;
      TBSignal s;
      s.id         = StringToInteger(f[0]);
      s.time       = (datetime)StringToInteger(f[1]);
      s.symbol     = f[2];
      s.side       = f[3];
      s.decision   = f[4];
      s.entry      = StringToDouble(f[5]);
      s.sl         = StringToDouble(f[6]);
      s.tp         = StringToDouble(f[7]);
      s.volume     = StringToDouble(f[8]);
      s.confidence = StringToDouble(f[9]);
      s.mlprob     = f[10];
      s.ticket     = StringToInteger(f[11]);
      s.reason     = f[12];
      int k = ArraySize(out);
      ArrayResize(out, k + 1);
      out[k] = s;
     }
   return ArraySize(out);
  }

color TB_Color(const TBSignal &s)
  {
   if(s.decision == "opened")
      return s.side == "buy" ? clrLime : clrRed;
   if(s.decision == "dry_run")
      return clrDodgerBlue;
   if(s.decision == "ml_filtered")
      return clrOrange;
   if(s.decision == "rejected")
      return clrMagenta;
   return clrDarkGray; // blocked
  }

string TB_DecisionText(const string decision)
  {
   if(decision == "opened")      return "ABIERTA";
   if(decision == "dry_run")     return "SIMULADA (dry run)";
   if(decision == "ml_filtered") return "FILTRADA POR ML";
   if(decision == "rejected")    return "RECHAZADA POR EL BROKER";
   return "BLOQUEADA";
  }

void TB_Line(const string name, const datetime t1, const datetime t2, const double price, const color clr)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TREND, 0, t1, price, t2, price);
   ObjectMove(0, name, 0, t1, price);
   ObjectMove(0, name, 1, t2, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
  }

void TB_DrawSignals(TBSignal &sigs[], const string symbol, const bool show_blocked)
  {
   int count = ArraySize(sigs);
   for(int i = 0; i < count; i++)
     {
      if(sigs[i].symbol != symbol)
         continue;
      bool passive = (sigs[i].decision == "blocked" || sigs[i].decision == "ml_filtered");
      if(passive && !show_blocked)
         continue;
      string name = TB_PREFIX + "sig_" + IntegerToString(sigs[i].id);
      double price = sigs[i].entry;
      if(price <= 0)
        {
         int shift = iBarShift(symbol, PERIOD_CURRENT, sigs[i].time);
         price = shift >= 0 ? iOpen(symbol, PERIOD_CURRENT, shift) : 0;
        }
      if(price <= 0)
         continue;
      ENUM_OBJECT kind = sigs[i].side == "buy" ? OBJ_ARROW_BUY : OBJ_ARROW_SELL;
      if(ObjectFind(0, name) < 0)
         ObjectCreate(0, name, kind, 0, sigs[i].time, price);
      ObjectSetInteger(0, name, OBJPROP_COLOR, TB_Color(sigs[i]));
      ObjectSetInteger(0, name, OBJPROP_WIDTH, passive ? 1 : 3);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      string tip = StringFormat("%s %s · %s\nconfianza %.0f%%  ML %s\n%s",
                                sigs[i].side == "buy" ? "COMPRA" : "VENTA", sigs[i].symbol,
                                TB_DecisionText(sigs[i].decision), sigs[i].confidence, sigs[i].mlprob, sigs[i].reason);
      if(sigs[i].volume > 0)
         tip += StringFormat("\n%.2f lotes  SL %s  TP %s", sigs[i].volume,
                             DoubleToString(sigs[i].sl, _Digits), DoubleToString(sigs[i].tp, _Digits));
      ObjectSetString(0, name, OBJPROP_TOOLTIP, tip);

      if(!passive && sigs[i].sl > 0)
        {
         datetime t2 = sigs[i].time + PeriodSeconds() * 12;
         TB_Line(name + "_sl", sigs[i].time, t2, sigs[i].sl, clrTomato);
         if(sigs[i].tp > 0)
            TB_Line(name + "_tp", sigs[i].time, t2, sigs[i].tp, clrMediumSeaGreen);
        }
     }
  }

void TB_Label(const int row, const string text, const color clr)
  {
   string name = TB_PREFIX + "panel_" + IntegerToString(row);
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
     }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 14);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 26 + row * 15);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
  }

void TB_DrawPanel(const string status, const string source)
  {
   string bg = TB_PREFIX + "panel_bg";
   if(ObjectFind(0, bg) < 0)
     {
      ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, 6);
      ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 20);
      ObjectSetInteger(0, bg, OBJPROP_XSIZE, 330);
      ObjectSetInteger(0, bg, OBJPROP_YSIZE, 200);
      ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'18,24,38');
      ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bg, OBJPROP_COLOR, C'60,70,90');
      ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
     }
   if(status == "")
     {
      TB_Label(0, "TradeBot · sin datos", clrOrange);
      TB_Label(1, "¿El sistema está corriendo? (" + source + ")", clrSilver);
      for(int r = 2; r < 12; r++)
         TB_Label(r, "", clrSilver);
      return;
     }
   bool running = TB_Value(status, "running", "0") == "1";
   string mode = TB_Value(status, "mode");
   color head = !running ? clrTomato : (mode == "LIVE" ? clrLime : clrDodgerBlue);
   TB_Label(0, StringFormat("TradeBot · %s · %s", running ? "EN MARCHA" : "DETENIDO", mode), head);
   TB_Label(1, StringFormat("%s %s · ML %s", TB_Value(status, "strategy"), TB_Value(status, "timeframe"), TB_Value(status, "ml_model")), clrWhite);
   TB_Label(2, "Símbolos: " + TB_Value(status, "symbols"), clrSilver);
   TB_Label(3, StringFormat("Equity %s · P&L día %s", TB_Value(status, "equity"), TB_Value(status, "day_pnl")), clrWhite);
   TB_Label(4, StringFormat("Abiertas %s (flotante %s) · ops hoy %s", TB_Value(status, "open_positions"),
                            TB_Value(status, "floating_pnl"), TB_Value(status, "trades_today")), clrWhite);
   TB_Label(5, StringFormat("Histórico: %s ops · win %s%% · PF %s", TB_Value(status, "stats_trades"),
                            TB_Value(status, "stats_win_rate"), TB_Value(status, "stats_pf")), clrSilver);
   TB_Label(6, StringFormat("Neto %s · R medio %s", TB_Value(status, "stats_net"), TB_Value(status, "stats_avg_r")), clrSilver);
   TB_Label(7, "Último ciclo hace " + TB_Value(status, "heartbeat_age") + " s", clrSilver);
   string err = TB_Value(status, "last_error");
   TB_Label(8, err == "-" ? "Sin errores" : "Error: " + StringSubstr(err, 0, 44), err == "-" ? clrMediumSeaGreen : clrTomato);
   TB_Label(9, "Actualizado " + TB_Value(status, "updated"), clrGray);
   TB_Label(10, "▲▼ verde/rojo abierta · azul simulada", clrGray);
   TB_Label(11, "gris bloqueada · naranja filtrada ML", clrGray);
  }
//+------------------------------------------------------------------+
