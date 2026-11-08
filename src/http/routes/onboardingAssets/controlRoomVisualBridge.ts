export const controlRoomVisualBridge = `
/* Canonical FCR visual bridge.
 * Keeps onboarding behavior intact while matching the approved Founder/User views.
 */
:root{
  --bg:#040614;
  --panel:rgba(8,14,34,.88);
  --panel-2:rgba(12,20,48,.92);
  --line:rgba(94,125,255,.24);
  --line-soft:rgba(108,132,255,.14);
  --muted:#9caad0;
  --accent:#6d63ff;
  --accent-2:#38c8ff;
  --accent-soft:rgba(89,75,255,.18);
}
body{
  background:
    radial-gradient(900px 520px at 82% -8%,rgba(104,55,255,.30),transparent 60%),
    radial-gradient(760px 440px at 10% 8%,rgba(34,200,255,.16),transparent 62%),
    radial-gradient(620px 360px at 52% 110%,rgba(88,52,255,.16),transparent 66%),
    linear-gradient(180deg,#030511 0%,#060a1c 48%,#03050f 100%);
}
body:before{
  content:"";
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:-1;
  opacity:.22;
  background-image:
    linear-gradient(rgba(118,143,255,.08) 1px,transparent 1px),
    linear-gradient(90deg,rgba(118,143,255,.08) 1px,transparent 1px);
  background-size:36px 36px;
  mask-image:linear-gradient(to bottom,black,transparent 82%);
}
.shell{width:min(1380px,calc(100% - 34px));padding:22px 0 64px}
.masthead{
  min-height:76px;
  align-items:center;
  margin-bottom:18px;
  padding:12px 18px;
  border:1px solid var(--line);
  border-radius:18px;
  background:rgba(4,8,24,.72);
  backdrop-filter:blur(18px);
  box-shadow:0 18px 52px rgba(0,0,0,.28);
}
.masthead h1{font-size:clamp(1.6rem,3.8vw,2.7rem);letter-spacing:-.04em;margin-bottom:6px}
.masthead .lede{margin:0;max-width:800px;color:#aab5d6;font-size:.9rem}
.eyebrow{color:#9ab8ff}
.status{border:1px solid rgba(110,134,255,.26);background:rgba(11,19,44,.76);color:#d9e4ff}
.identity-strip{
  margin:0 0 18px;
  padding:10px 14px;
  border:1px solid var(--line-soft);
  border-radius:14px;
  background:rgba(7,12,29,.58);
}
.panel{
  border:1px solid var(--line);
  border-radius:18px;
  background:
    radial-gradient(100% 130% at 12% 0%,rgba(85,64,255,.10),transparent 56%),
    linear-gradient(180deg,rgba(10,18,43,.94),rgba(5,10,27,.94));
  box-shadow:0 22px 70px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.045);
  backdrop-filter:blur(16px);
}
.composer{overflow:hidden;position:relative}
.composer:before{height:2px;background:linear-gradient(90deg,transparent,#35c6ff,#7a5cff 52%,transparent)}
.composer:after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:radial-gradient(620px 240px at 50% 0%,rgba(69,129,255,.12),transparent 70%);
}
.composer>*{position:relative;z-index:1}
.composer-hero{align-items:center;padding-bottom:22px;margin-bottom:22px}
.composer-hero h2{font-size:clamp(1.8rem,3.2vw,2.75rem)}
.steps{gap:10px}
.steps li{letter-spacing:.04em}
.steps li span{width:28px;height:28px;border-color:rgba(104,130,255,.26);background:rgba(8,15,34,.85)}
.steps li.active span{
  border-color:#4cc8ff;
  background:linear-gradient(135deg,#4558ff,#27bff8);
  box-shadow:0 0 0 4px rgba(62,116,255,.13),0 0 24px rgba(57,184,255,.28);
}
.composer-step{min-height:390px}
fieldset{margin-bottom:24px}
legend{font-size:clamp(1.25rem,2.3vw,1.75rem)}
.field-help{color:#95a4c8}
.choice-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.project-type-grid .choice-card:last-child{grid-column:2/4}
.choice-card{
  min-height:132px;
  padding:18px;
  border:1px solid rgba(106,131,255,.22);
  border-radius:16px;
  background:linear-gradient(165deg,rgba(14,24,56,.90),rgba(7,14,34,.96));
  box-shadow:inset 0 1px rgba(255,255,255,.035);
}
.choice-card:hover{transform:translateY(-2px);border-color:rgba(66,199,255,.55);background:linear-gradient(165deg,rgba(21,34,75,.95),rgba(8,16,40,.98))}
.choice-card:has(input:checked){
  border-color:#5e73ff;
  background:
    radial-gradient(120% 120% at 50% 0%,rgba(83,67,255,.30),transparent 60%),
    linear-gradient(165deg,rgba(19,32,78,.98),rgba(8,17,44,.98));
  box-shadow:0 0 0 1px rgba(76,207,255,.22),0 12px 34px rgba(28,55,140,.32),inset 0 1px rgba(255,255,255,.06);
}
.choice-icon{color:#6fb7ff;font-size:1.75rem;text-shadow:0 0 18px rgba(86,156,255,.36)}
.choice-card strong{font-size:.98rem}
.choice-card small{font-size:.75rem;color:#98a5c3}
.mission-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.mission-card,.mission-grid .mission-card:nth-last-child(-n+3){min-height:132px}
input{
  border-color:rgba(101,128,255,.24);
  background:rgba(4,10,25,.92);
  box-shadow:inset 0 1px rgba(255,255,255,.025);
}
input:focus-visible{border-color:#4acbff;outline:3px solid rgba(79,117,255,.20)}
.state-grid{gap:10px}
.state-chip span{
  border-radius:10px;
  border-color:rgba(104,130,255,.24);
  background:rgba(7,15,34,.90);
  color:#aeb9d5;
}
.state-chip:has(input:checked) span{
  border-color:#5d75ff;
  background:linear-gradient(135deg,rgba(69,72,255,.42),rgba(37,144,255,.28));
  color:#eef5ff;
  box-shadow:0 0 22px rgba(80,91,255,.18);
}
.provider-grid{gap:12px}
.provider-card{
  border-color:rgba(103,129,255,.22);
  border-radius:16px;
  background:linear-gradient(165deg,rgba(13,23,54,.90),rgba(6,13,31,.96));
}
.provider-card:has(input:checked){
  border-color:rgba(73,197,255,.46);
  background:linear-gradient(165deg,rgba(18,38,79,.95),rgba(7,18,42,.98));
  box-shadow:0 10px 28px rgba(16,48,112,.24);
}
.confirm-row{
  border-color:rgba(255,199,92,.26);
  background:linear-gradient(135deg,rgba(52,39,16,.60),rgba(15,16,29,.86));
}
button,.primary-link{
  border-radius:12px;
  color:#fff;
  background:linear-gradient(100deg,#5548ff,#4f79ff 48%,#2cc8ff);
  box-shadow:0 10px 28px rgba(61,79,255,.25),0 0 24px rgba(49,184,255,.10);
}
button.secondary{
  background:rgba(10,19,43,.90);
  color:#e9efff;
  border:1px solid rgba(106,132,255,.30);
  box-shadow:none;
}
button.text-button{background:transparent;box-shadow:none;color:#91a1c4}
.profile-card,.module-card,.metric{
  border-color:rgba(104,131,255,.22);
  background:linear-gradient(165deg,rgba(12,22,52,.90),rgba(6,13,31,.96));
}
.module-card:hover{border-color:rgba(74,199,255,.52);box-shadow:0 14px 34px rgba(23,50,128,.22)}
.metric span{background:linear-gradient(90deg,#fff,#b9a9ff 44%,#73d9ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.ready{align-items:center}
.chief-presence{border-color:rgba(226,178,79,.42);box-shadow:0 18px 46px rgba(0,0,0,.45),0 0 30px rgba(182,128,34,.08),inset 0 1px rgba(255,214,122,.10)}
@media(max-width:980px){
  .choice-grid,.mission-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .project-type-grid .choice-card:last-child{grid-column:auto}
  .provider-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .composer-hero{align-items:flex-start}
}
@media(max-width:640px){
  .shell{width:min(100% - 20px,760px);padding-top:10px}
  .masthead{padding:10px 12px;border-radius:14px;gap:12px}
  .masthead .lede{display:none}
  .masthead h1{font-size:1.25rem;margin:0}
  .identity-strip{padding:8px 10px}
  .panel{padding:16px;border-radius:16px}
  .composer-hero{display:grid;gap:14px;padding-bottom:16px;margin-bottom:18px}
  .steps{justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}
  .steps li{font-size:.66rem;white-space:nowrap}
  .steps li span{width:24px;height:24px}
  .choice-grid,.mission-grid,.provider-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .choice-card,.mission-card,.mission-grid .mission-card:nth-last-child(-n+3){min-height:118px;padding:14px}
  .choice-card small{font-size:.7rem;line-height:1.35}
  .choice-icon{font-size:1.45rem}
  .form-grid{grid-template-columns:1fr}
  .form-grid .wide-field{grid-column:auto}
  .step-actions{position:sticky;bottom:8px;padding:10px;border:1px solid rgba(107,132,255,.18);border-radius:14px;background:rgba(4,9,23,.90);backdrop-filter:blur(14px)}
  .step-actions button{flex:1}
  .profile-card,.metrics,.module-grid{grid-template-columns:1fr 1fr}
  .ready{display:grid}
}
@media(max-width:420px){
  .choice-grid,.mission-grid,.provider-grid{grid-template-columns:1fr 1fr}
  .choice-card,.mission-card,.mission-grid .mission-card:nth-last-child(-n+3){min-height:108px;padding:12px}
  .profile-card,.metrics,.module-grid{grid-template-columns:1fr}
}
`;
