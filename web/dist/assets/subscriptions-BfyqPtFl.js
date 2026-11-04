import{a}from"./api-CD19Ed_l.js";async function i(){try{return await a("/api/me/subscription")}catch{return null}}async function r(){const t=await i();return!!(t&&t.active)}export{r as i};
