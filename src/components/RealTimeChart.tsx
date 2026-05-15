import { useEffect, useRef } from 'react';
import { AssetConfig } from '../constants';

interface RealTimeChartProps {
  asset: AssetConfig;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

export default function RealTimeChart({ asset }: RealTimeChartProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = 'tradingview-widget-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initWidget = () => {
      if (container.current && window.TradingView) {
        new window.TradingView.widget({
          autosize: true,
          symbol: getSymbol(asset.symbol),
          interval: "1",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          hide_top_toolbar: true,
          hide_legend: true,
          save_image: false,
          container_id: container.current.id,
          backgroundColor: "rgba(0, 0, 0, 1)",
          gridColor: "rgba(255, 255, 255, 0.05)",
        });
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      if (window.TradingView) {
        initWidget();
      } else {
        script.onload = initWidget;
      }
    }

    return () => {
      // Clean up if necessary, though TradingView widget often manages its own iframe
    };
  }, [asset]);

  const getSymbol = (symbol: string) => {
    return `BINANCE:${symbol}USDT`;
  };

  return (
    <div className="w-full glass overflow-hidden ritual-glow h-[250px] sm:h-[400px] lg:h-[480px]">
      <div 
        id={`tradingview_${asset.id}`} 
        ref={container} 
        className="w-full h-full"
      />
    </div>
  );
}
