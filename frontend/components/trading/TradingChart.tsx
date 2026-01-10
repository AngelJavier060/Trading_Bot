import React from 'react';
import TradingChartBase from '../charts/TradingChart';

interface TradingChartProps {
  asset?: string;
  data?: any[];
  indicators?: any;
  height?: number;
}

const TradingChart: React.FC<TradingChartProps> = (props) => {
  return <TradingChartBase {...props} />;
};

export default TradingChart;
