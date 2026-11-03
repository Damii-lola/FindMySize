import{h as i}from"./api-BPp_27zP.js";async function a(){try{return await i("/api/me/subscription")}catch{return null}}async function r(){const t=await a();return!!(t&&t.active)}export{r as i};
