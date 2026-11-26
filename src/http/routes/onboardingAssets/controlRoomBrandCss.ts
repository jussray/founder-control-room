export const controlRoomBrandCss = `
:root{
  --fcr-ink:#040713;
  --fcr-navy:#07101f;
  --fcr-blue:#268dff;
  --fcr-cyan:#42d7ff;
  --fcr-purple:#8b5cff;
  --fcr-violet:#b56cff;
  --fcr-orange:#ff9a4d;
  --fcr-sun:#ffc36a;
  --fcr-ombre:linear-gradient(108deg,#31c7ff 0%,#3188ff 29%,#825cff 58%,#b35ff1 75%,#ff9852 100%);
  --fcr-ombre-soft:linear-gradient(120deg,rgba(49,199,255,.18),rgba(49,136,255,.12) 31%,rgba(130,92,255,.16) 60%,rgba(255,152,82,.12));
}

html{background:var(--fcr-ink)}
body{
  background:
    radial-gradient(circle at 12% 9%,rgba(52,183,255,.24),transparent 26rem),
    radial-gradient(circle at 79% 12%,rgba(139,92,255,.24),transparent 30rem),
    radial-gradient(circle at 88% 31%,rgba(255,154,77,.15),transparent 24rem),
    linear-gradient(180deg,#071127 0%,#050816 48%,#03050c 100%);
}
body:before{
  content:"";
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:-1;
  background:
    linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px),
    radial-gradient(ellipse at 50% 100%,rgba(112,72,255,.1),transparent 55%);
  background-size:44px 44px,44px 44px,auto;
  mask-image:linear-gradient(to bottom,rgba(0,0,0,.72),transparent 88%);
}

.masthead h1,
.composer-hero h2,
.ready h2{
  background:linear-gradient(102deg,#ffffff 0%,#bfeeff 32%,#bba7ff 67%,#ffc28c 100%);
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.eyebrow,.module-card small,.profile-card small{
  color:#c5b8ff;
}

.panel{
  border-color:rgba(122,122,255,.28);
  background:
    radial-gradient(circle at 98% 0%,rgba(255,151,76,.08),transparent 18rem),
    radial-gradient(circle at 8% 4%,rgba(45,190,255,.09),transparent 20rem),
    linear-gradient(155deg,rgba(12,23,45,.97),rgba(10,11,31,.97) 58%,rgba(20,10,34,.97));
  box-shadow:
    0 30px 90px rgba(0,0,0,.48),
    0 0 54px rgba(81,111,255,.08),
    inset 0 1px rgba(255,255,255,.055);
}

.composer:before{
  height:2px;
  background:var(--fcr-ombre);
  box-shadow:0 0 24px rgba(107,93,255,.45),0 0 42px rgba(255,154,77,.12);
}

.identity-strip{
  border-bottom-color:rgba(113,111,210,.25);
}

input{
  border-color:rgba(91,118,177,.48);
  background:linear-gradient(180deg,rgba(6,16,33,.98),rgba(8,13,29,.98));
}
input:focus{
  border-color:#8c6dff;
  box-shadow:0 0 0 3px rgba(91,139,255,.12),0 0 28px rgba(140,91,255,.12);
}

button,.primary-link{
  background:var(--fcr-ombre);
  color:#07101d;
  box-shadow:0 12px 34px rgba(72,112,255,.28),0 0 24px rgba(143,88,255,.13);
}
button.secondary{
  background:linear-gradient(145deg,rgba(25,35,62,.94),rgba(19,18,48,.94));
  color:#f4f2ff;
  border:1px solid rgba(118,110,219,.38);
  box-shadow:none;
}

.steps li span{
  border-color:rgba(98,112,171,.46);
  background:#081020;
}
.steps li.active span{
  border-color:#776cff;
  background:linear-gradient(145deg,#1f4ba3,#5e43d0 66%,#9b58e8);
  color:white;
  box-shadow:0 0 0 4px rgba(72,119,255,.12),0 0 22px rgba(142,83,255,.36),10px 0 30px rgba(255,154,77,.08);
}
.steps li.complete span{
  border-color:#3fc4ff;
  color:#bfefff;
}

.choice-card{
  border-color:rgba(78,103,157,.42);
  background:
    radial-gradient(circle at 100% 0%,rgba(125,79,255,.055),transparent 12rem),
    linear-gradient(180deg,rgba(10,20,37,.98),rgba(7,13,29,.98));
}
.choice-card:hover{
  border-color:rgba(89,183,255,.62);
  box-shadow:0 15px 34px rgba(0,0,0,.3),0 0 24px rgba(68,140,255,.08);
}
.choice-card:has(input:checked){
  border-color:#7f67ff;
  background:
    radial-gradient(circle at 94% 10%,rgba(255,153,75,.11),transparent 9rem),
    linear-gradient(145deg,rgba(17,53,96,.98),rgba(33,29,84,.98) 63%,rgba(59,26,83,.98));
  box-shadow:
    0 0 0 1px rgba(72,201,255,.22),
    0 18px 40px rgba(2,5,13,.6),
    0 0 32px rgba(117,84,255,.18);
}
.choice-icon{
  background:var(--fcr-ombre);
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
  filter:drop-shadow(0 0 12px rgba(75,131,255,.18));
}

.state-chip span{
  border-color:rgba(77,102,158,.48);
  background:#081220;
}
.state-chip:has(input:checked) span{
  border-color:#8b68ff;
  background:linear-gradient(105deg,rgba(28,91,166,.88),rgba(78,49,151,.9) 66%,rgba(152,71,151,.78));
  color:#fff;
  box-shadow:0 0 20px rgba(113,82,255,.15);
}

.provider-card{
  border-color:rgba(77,102,158,.42);
  background:linear-gradient(180deg,rgba(8,19,35,.98),rgba(9,13,29,.98));
}
.provider-card:has(input:checked){
  border-color:rgba(111,91,235,.62);
  background:linear-gradient(145deg,rgba(15,45,81,.96),rgba(37,23,75,.96));
  box-shadow:0 0 24px rgba(93,82,255,.08);
}

.confirm-row{
  border-color:rgba(255,170,92,.38);
  background:linear-gradient(105deg,rgba(49,29,23,.72),rgba(31,20,43,.76));
}

.profile-card,.module-card,.metric{
  border-color:rgba(87,104,166,.4);
  background:
    radial-gradient(circle at 100% 0%,rgba(255,151,75,.055),transparent 10rem),
    linear-gradient(145deg,rgba(9,21,39,.98),rgba(13,13,34,.98));
}
.module-card:hover{
  border-color:#796aff;
  box-shadow:0 0 26px rgba(90,94,255,.11);
}

.status.pending{background:rgba(31,49,81,.82)}
.status.ok{background:rgba(13,67,50,.85);color:#9ef0c6}
.status.error{background:rgba(72,24,36,.9);color:#ffc0c7}

#system-status.ok{box-shadow:0 0 20px rgba(82,224,163,.08)}

@media(max-width:720px){
  body{
    background:
      radial-gradient(circle at 10% 4%,rgba(52,183,255,.19),transparent 18rem),
      radial-gradient(circle at 88% 8%,rgba(139,92,255,.18),transparent 20rem),
      radial-gradient(circle at 88% 26%,rgba(255,154,77,.1),transparent 18rem),
      linear-gradient(180deg,#071127 0%,#050816 52%,#03050c 100%);
  }
}
`;
