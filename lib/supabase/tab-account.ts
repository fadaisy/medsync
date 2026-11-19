import {
  ACTIVE_ACCOUNT_COOKIE,
  ACTIVE_ACCOUNT_COOKIE_OPTIONS,
  TAB_ACCOUNT_HEADER,
  TAB_ADOPT_COOKIE,
  TAB_ID_HEADER,
} from "@/lib/supabase/accounts";

/** Read by the browser Supabase client (lib/supabase/client.ts). */
export const TAB_ACCOUNT_GLOBAL = "__msTabAccount";

/**
 * One account per tab (ADR 0529). Runs inline in <head>, before any of Next's code, so it is a
 * plain string: no imports, no build helpers.
 *
 * - A page load starts as the account it was served with (`ms-account`).
 * - Every request this tab makes to this site names that account (`x-ms-account`) and the tab
 *   (`x-ms-tab`). Next's router sends navigations, prefetches and server actions through
 *   `window.fetch`, so they all carry it.
 * - When the tab is shown or focused it writes its account back to `ms-account`, so a reload, a
 *   form post or a typed address in the tab you are using loads as that tab's account.
 * - After a request that switched this tab's account (a sign-in), the server leaves
 *   `ms-account-tab=<tab>:<slot>`; only this tab takes it up.
 */
export function tabAccountScript(): string {
  const o = {
    cookie: ACTIVE_ACCOUNT_COOKIE,
    adopt: TAB_ADOPT_COOKIE,
    header: TAB_ACCOUNT_HEADER,
    tabHeader: TAB_ID_HEADER,
    attrs: `; path=/; max-age=${ACTIVE_ACCOUNT_COOKIE_OPTIONS.maxAge}; samesite=lax${
      ACTIVE_ACCOUNT_COOKIE_OPTIONS.secure ? "; secure" : ""
    }`,
    global: TAB_ACCOUNT_GLOBAL,
  };
  return `(function(o){
var w=window,d=document;
function read(n){var m=d.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):null}
var slot=read(o.cookie)||"0";
var tab="";for(var i=0;i<16;i++)tab+="abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random()*36)];
function claim(){d.cookie=o.cookie+"="+slot+o.attrs}
function adopt(){var v=read(o.adopt);if(!v)return;var p=v.split(":");if(p[0]!==tab)return;slot=p[1];d.cookie=o.adopt+"=; path=/; max-age=0";claim()}
function shown(){if(d.visibilityState==="visible")claim()}
w.addEventListener("focus",claim);d.addEventListener("visibilitychange",shown);w.addEventListener("pageshow",shown);
var f=w.fetch;
w.fetch=function(input,init){
  var req=typeof Request!=="undefined"&&input instanceof Request;
  var url;try{url=new URL(req?input.url:String(input),w.location.href)}catch(e){return f.call(w,input,init)}
  if(url.origin!==w.location.origin)return f.call(w,input,init);
  var h=new Headers(init&&init.headers?init.headers:req?input.headers:undefined);
  h.set(o.header,slot);h.set(o.tabHeader,tab);
  var next={};for(var k in init)next[k]=init[k];next.headers=h;
  return f.call(w,input,next).then(function(r){adopt();return r});
};
w[o.global]=function(){return slot};
})(${JSON.stringify(o)});`;
}
