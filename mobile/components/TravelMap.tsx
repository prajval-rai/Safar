import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useColorScheme } from '@/components/useColorScheme';

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  /** A photo for the pin; without one it shows `emoji`. */
  image?: string | null;
  emoji?: string;
  /** Small label above the pin (e.g. "You"). */
  label?: string;
}

export interface MapArea {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/**
 * A map drawn with Leaflet inside a WebView, on Esri's free grey canvas
 * basemap (with its place-name layer on top) — no API key needed, so it
 * can't come up blank or watermarked for a missing one. Pins are round photos with a tail; the selected one grows
 * and gets a halo. Tapping a pin calls `onSelect(id)`, tapping the map
 * `onSelect(null)`.
 */
export function TravelMap({
  pins,
  areas = [],
  selectedId,
  onSelect,
  style,
  fitPadding = 60,
  bottomInset = 0,
}: {
  pins: MapPin[];
  areas?: MapArea[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  style?: StyleProp<ViewStyle>;
  fitPadding?: number;
  /** Space covered by overlays at the bottom (a card, the tab bar), so
   *  fitting the pins keeps them above it. */
  bottomInset?: number;
}) {
  const dark = useColorScheme() === 'dark';
  const ref = useRef<WebView>(null);

  // The page is only rebuilt when the pins themselves change; selection is
  // pushed in without a reload.
  const pinsKey = JSON.stringify(pins);
  const areasKey = JSON.stringify(areas);
  const html = useMemo(
    () => buildHtml({ pins: JSON.parse(pinsKey), areas: JSON.parse(areasKey), dark, fitPadding, bottomInset }),
    [pinsKey, areasKey, dark, fitPadding, bottomInset],
  );

  useEffect(() => {
    ref.current?.injectJavaScript(`window.setSelected && window.setSelected(${JSON.stringify(selectedId ?? null)}); true;`);
  }, [selectedId, html]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; id: string | null };
      if (message.type === 'select') onSelect?.(message.id);
    } catch {
      // Not ours.
    }
  }

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://safar.app/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onLoadEnd={() =>
          ref.current?.injectJavaScript(
            `window.setSelected && window.setSelected(${JSON.stringify(selectedId ?? null)}); true;`,
          )
        }
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        // A white flash before the page paints looks broken on a dark screen.
        containerStyle={{ backgroundColor: dark ? '#1a1d20' : '#eef0f3' }}
      />
    </View>
  );
}

function buildHtml({
  pins,
  areas,
  dark,
  fitPadding,
  bottomInset,
}: {
  pins: MapPin[];
  areas: MapArea[];
  dark: boolean;
  fitPadding: number;
  bottomInset: number;
}): string {
  // JSON inside a <script>: escape "<" so a stray "</script>" can't end it.
  const data = JSON.stringify({ pins, areas }).replace(/</g, '\\u003c');
  const canvas = dark ? 'World_Dark_Gray' : 'World_Light_Gray';
  const bg = dark ? '#1a1d20' : '#eef0f3';
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;height:100%;background:${bg}}
.leaflet-control-attribution{font-size:9px;opacity:.7}
.pin{position:relative;width:48px;height:58px;transform-origin:50% 100%;transition:transform .18s}
.pin .ph{position:relative;z-index:1;width:48px;height:48px;border-radius:50%;background:#ddd center/cover no-repeat;border:3px solid #22272b;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 8px rgba(0,0,0,.25)}
.pin:after{content:"";position:absolute;left:50%;bottom:2px;width:12px;height:12px;background:#22272b;transform:translateX(-50%) rotate(45deg);border-radius:2px;z-index:0}
.pin .lb{position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:#22272b;color:#fff;font:600 10px sans-serif;padding:2px 7px;border-radius:9px;white-space:nowrap}
.pin.sel{transform:scale(1.25)}
.pin.sel .ph{border-color:#FFB547;box-shadow:0 0 0 8px rgba(120,120,120,.28),0 0 0 16px rgba(120,120,120,.16)}
.pin.me .ph{border-color:#FFB547}
.leaflet-div-icon{background:none;border:none}
</style></head><body><div id="map"></div><script>
var D=${data};
var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([22.5,79],4);
var esri='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${canvas}';L.tileLayer(esri+'_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'Esri, HERE, Garmin, © OpenStreetMap'}).addTo(map);L.tileLayer(esri+'_Reference/MapServer/tile/{z}/{y}/{x}',{maxZoom:16}).addTo(map);setTimeout(function(){map.invalidateSize();},250);window.addEventListener('resize',function(){map.invalidateSize();});
var markers={};var bounds=[];
D.areas.forEach(function(a){L.circle([a.latitude,a.longitude],{radius:a.radiusKm*1000,color:'#FFB547',weight:2,fillColor:'#FFB547',fillOpacity:.18}).addTo(map);bounds.push([a.latitude,a.longitude]);});
function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
D.pins.forEach(function(p){
  var inner=p.image?'<div class="ph" style="background-image:url(\\''+encodeURI(p.image)+'\\')"></div>':'<div class="ph" style="background:#fff">'+esc(p.emoji||'📍')+'</div>';
  var html='<div class="pin'+(p.label?' me':'')+'" id="p_'+p.id+'">'+(p.label?'<div class="lb">'+esc(p.label)+'</div>':'')+inner+'</div>';
  var icon=L.divIcon({html:html,className:'',iconSize:[48,58],iconAnchor:[24,58]});
  var m=L.marker([p.latitude,p.longitude],{icon:icon}).addTo(map);
  m.on('click',function(e){L.DomEvent.stopPropagation(e);send(p.id);});
  markers[p.id]=m;bounds.push([p.latitude,p.longitude]);
});
function send(id){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'select',id:id}));}
map.on('click',function(){send(null);});
var pad=${fitPadding};
if(bounds.length===1){map.setView(bounds[0],11);}
else if(bounds.length>1){map.fitBounds(bounds,{paddingTopLeft:[pad,pad+40],paddingBottomRight:[pad,pad+${bottomInset}],maxZoom:12});}

var current=null;
window.setSelected=function(id){
  if(current){var o=document.getElementById('p_'+current);if(o)o.classList.remove('sel');if(markers[current])markers[current].setZIndexOffset(0);}
  current=id;
  if(id&&markers[id]){var n=document.getElementById('p_'+id);if(n)n.classList.add('sel');markers[id].setZIndexOffset(1000);
    var ll=markers[id].getLatLng();var pt=map.project(ll,map.getZoom());pt.y+=${Math.round(bottomInset / 2)};map.panTo(map.unproject(pt,map.getZoom()),{animate:true});}
};
</script></body></html>`;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
