/*!
 * (C) Ionic http://ionicframework.com - MIT License
 */
import{e as o,w as s}from"./p-Ci0c0wtC.js";import{a as t,s as r}from"./p-DBXYO0BD.js";import{c as a}from"./p-BiQyyAay.js";import"./p-Dojwmvde.js";const i=()=>{const i=window;i.addEventListener("statusTap",(()=>{o((()=>{const o=document.elementFromPoint(i.innerWidth/2,i.innerHeight/2);if(!o)return;const e=t(o);e&&new Promise((o=>a(e,o))).then((()=>{s((async()=>{e.style.setProperty("--overflow","hidden"),await r(e,300),e.style.removeProperty("--overflow")}))}))}))}))};export{i as startStatusTap}