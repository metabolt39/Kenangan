const C='kk-v3';
const SHELL=['./','badge-96.png','index.html','app.js','firebase-config.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp)).catch(()=>{});return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});

self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));});

self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(x){d={title:'Kenangan Keluarga',body:e.data?e.data.text():''};}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    if(list.some(c=>c.visibilityState==='visible'))return;
    return self.registration.showNotification(d.title||'Kenangan Keluarga',{body:d.body||'',icon:'icon-192.png',badge:'badge-96.png',tag:d.tag||'kk',renotify:true});
  }));
});
