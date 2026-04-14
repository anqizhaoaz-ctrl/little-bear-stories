import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { StoryRecord } from '../types';

// NOTE: You must provide a valid Mapbox Access Token in your .env file
// VITE_MAPBOX_ACCESS_TOKEN=your_token_here
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiYWlzdHVkaW8iLCJhIjoiY204ZzZ6NXA1MGJ6cjJ4Z2VnN3czIn0.placeholder';

interface GrowthReportProps {
  history: StoryRecord[];
}

// Simple mapping of country names to coordinates (can be expanded)
const countryCoords: Record<string, [number, number]> = {
  '中国': [104.1954, 35.8617],
  '德国': [10.4515, 51.1657],
  '希腊': [21.8243, 39.0742],
  '法国': [2.2137, 46.2276],
  '英国': [-3.4360, 55.3781],
  '意大利': [12.5674, 41.8719],
  '日本': [138.2529, 36.2048],
  '印度': [78.9629, 20.5937],
  '美国': [-95.7129, 37.0902],
  '俄罗斯': [105.3188, 61.5240],
  '埃及': [30.8025, 26.8206],
  '丹麦': [9.5018, 56.2639],
  '伊拉克': [43.6793, 33.2232], // 一千零一夜
  '阿拉伯': [45.0792, 23.8859],
};

export default function GrowthReport({ history }: GrowthReportProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const newCounts: Record<string, number> = {};
    history.forEach(h => {
      newCounts[h.originCountry] = (newCounts[h.originCountry] || 0) + 1;
    });
    setCounts(newCounts);
  }, [history]);

  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [30, 20],
      zoom: 1.5,
      attributionControl: false
    });

    map.current.on('load', () => {
      // Remove default labels if needed, but light-v11 is pretty clean
    });

    return () => map.current?.remove();
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Clear existing markers
    const markers = document.querySelectorAll('.mapboxgl-marker');
    markers.forEach(m => m.remove());

    // Add new markers for counts
    Object.entries(counts).forEach(([country, count]) => {
      const coords = countryCoords[country];
      if (coords) {
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.innerHTML = `
          <div class="flex flex-col items-center">
            <div class="bg-brand-red text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white">
              ${count}
            </div>
            <span class="text-[10px] font-bold text-brand-navy mt-1 bg-white/80 px-1 rounded">${country}</span>
          </div>
        `;

        new mapboxgl.Marker(el)
          .setLngLat(coords)
          .addTo(map.current!);
      }
    });
  }, [counts]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-brand-muted/10">
        <h3 className="text-lg font-bold text-brand-navy mb-4">故事足迹地图</h3>
        <div 
          ref={mapContainer} 
          className="w-full h-[400px] rounded-2xl overflow-hidden border border-brand-muted/20"
        />
        <p className="text-xs text-brand-muted mt-4 text-center">
          宝贝已经读过了来自 {Object.keys(counts).length} 个国家的故事
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-brand-navy text-white p-6 rounded-[32px] space-y-1">
          <p className="text-brand-muted text-xs font-bold uppercase tracking-wider">累计阅读</p>
          <p className="text-4xl font-display font-bold">{history.length}</p>
          <p className="text-xs opacity-60">篇精彩故事</p>
        </div>
        <div className="bg-brand-red text-white p-6 rounded-[32px] space-y-1">
          <p className="text-white/60 text-xs font-bold uppercase tracking-wider">最爱类型</p>
          <p className="text-2xl font-display font-bold">
            {history.length > 0 ? 
              Object.entries(history.reduce((acc, curr) => {
                acc[curr.type] = (acc[curr.type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0][0] 
              : '暂无'}
          </p>
          <p className="text-xs opacity-60">读得最多</p>
        </div>
      </div>
    </div>
  );
}
