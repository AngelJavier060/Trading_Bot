//+------------------------------------------------------------------+
//| TradeBotRecorder.mqh                                             |
//| Exporta las posiciones cerradas (a partir de los deals) a un CSV |
//| en Common\Files, en el formato que importa el TradeBot.          |
//|                                                                  |
//| Se puede incluir en CUALQUIER EA para comparar sus resultados    |
//| del Probador de Estrategias con el sistema:                      |
//|    #include <TradeBot/TradeBotRecorder.mqh>                      |
//|    double OnTester() { TBR_SaveDeals("TradeBot\\mi_ea.csv", -1); return 0; }
//+------------------------------------------------------------------+
#property strict

string TBR_Reason(const long reason)
  {
   switch((int)reason)
     {
      case DEAL_REASON_SL:     return "sl";
      case DEAL_REASON_TP:     return "tp";
      case DEAL_REASON_SO:     return "stop_out";
      case DEAL_REASON_EXPERT: return "expert";
      case DEAL_REASON_CLIENT: return "manual";
      case DEAL_REASON_MOBILE: return "manual";
      case DEAL_REASON_WEB:    return "manual";
     }
   return "other";
  }

int TBR_Find(const long &ids[], const long id)
  {
   for(int i = ArraySize(ids) - 1; i >= 0; i--)
      if(ids[i] == id)
         return i;
   return -1;
  }

//--- magic_filter < 0: todas las posiciones
bool TBR_SaveDeals(const string file_name, const long magic_filter)
  {
   if(!HistorySelect(0, TimeCurrent() + 86400))
      return false;

   long     pos[];
   string   tag[], sym[], side[], reason[];
   double   vol[], open_px[], close_px[], sl[], tp[], profit[], comm[], swp[];
   datetime open_t[], close_t[];

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;
      long type = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)
         continue; // depósitos, comisiones de cuenta, etc.
      long magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      long id    = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      int  k     = TBR_Find(pos, id);
      if(entry == DEAL_ENTRY_IN)
        {
         if(magic_filter >= 0 && magic != magic_filter)
            continue;
         k = ArraySize(pos);
         int n = k + 1;
         ArrayResize(pos, n); ArrayResize(tag, n); ArrayResize(sym, n); ArrayResize(side, n);
         ArrayResize(reason, n); ArrayResize(vol, n); ArrayResize(open_px, n); ArrayResize(close_px, n);
         ArrayResize(sl, n); ArrayResize(tp, n); ArrayResize(profit, n); ArrayResize(comm, n);
         ArrayResize(swp, n); ArrayResize(open_t, n); ArrayResize(close_t, n);
         pos[k]      = id;
         tag[k]      = HistoryDealGetString(deal, DEAL_COMMENT);
         sym[k]      = HistoryDealGetString(deal, DEAL_SYMBOL);
         side[k]     = type == DEAL_TYPE_BUY ? "buy" : "sell";
         vol[k]      = HistoryDealGetDouble(deal, DEAL_VOLUME);
         open_px[k]  = HistoryDealGetDouble(deal, DEAL_PRICE);
         open_t[k]   = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
         sl[k]       = HistoryDealGetDouble(deal, DEAL_SL);
         tp[k]       = HistoryDealGetDouble(deal, DEAL_TP);
         comm[k]     = HistoryDealGetDouble(deal, DEAL_COMMISSION);
         profit[k]   = 0;
         swp[k]      = 0;
         close_px[k] = 0;
         close_t[k]  = 0;
         reason[k]   = "";
        }
      else
         if(k >= 0 && (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY))
           {
            close_px[k] = HistoryDealGetDouble(deal, DEAL_PRICE);
            close_t[k]  = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
            profit[k]  += HistoryDealGetDouble(deal, DEAL_PROFIT);
            comm[k]    += HistoryDealGetDouble(deal, DEAL_COMMISSION);
            swp[k]     += HistoryDealGetDouble(deal, DEAL_SWAP);
            reason[k]   = TBR_Reason(HistoryDealGetInteger(deal, DEAL_REASON));
           }
     }

   int h = FileOpen(file_name, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI, '\t', CP_UTF8);
   if(h == INVALID_HANDLE)
     {
      PrintFormat("TradeBotRecorder: no se pudo crear %s (error %d)", file_name, GetLastError());
      return false;
     }
   FileWriteString(h, "position|tag|symbol|side|volume|open_time|open_price|close_time|close_price|sl|tp|profit|commission|swap|reason\n");
   for(int i = 0; i < ArraySize(pos); i++)
     {
      if(close_t[i] == 0)
         continue; // sigue abierta
      int digits = (int)SymbolInfoInteger(sym[i], SYMBOL_DIGITS);
      FileWriteString(h, StringFormat("%I64d|%s|%s|%s|%.2f|%I64d|%s|%I64d|%s|%s|%s|%.2f|%.2f|%.2f|%s\n",
                                      pos[i], tag[i], sym[i], side[i], vol[i],
                                      (long)open_t[i], DoubleToString(open_px[i], digits),
                                      (long)close_t[i], DoubleToString(close_px[i], digits),
                                      DoubleToString(sl[i], digits), DoubleToString(tp[i], digits),
                                      profit[i], comm[i], swp[i], reason[i]));
     }
   FileClose(h);
   PrintFormat("TradeBotRecorder: %d posiciones exportadas a Common\\Files\\%s", ArraySize(pos), file_name);
   return true;
  }
//+------------------------------------------------------------------+
