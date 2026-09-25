/* ============================================================
   DATA.JS — Demo data for NextBright CRM
   ============================================================ */
'use strict';

const NB = window.NB = {};

/* ---- Helpers ---- */
function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
const AVATARS_COLORS = ['#2563EB','#7C3AED','#10B981','#F59E0B','#EF4444','#0EA5E9','#EC4899','#6366F1'];
NB.avatarColor = function(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATARS_COLORS[Math.abs(h) % AVATARS_COLORS.length];
};
NB.initials = name => name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0,2);
NB.ago = function(days) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
};

/* ---- Leads ---- */
NB.leads = [
  { id: 1,  name: 'WhatsApp Contact (+918111986637)', phone: '+918111986637', company: 'Inbound WhatsApp', email: 'contact.918111986637@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: 'Today 13:58', date: NB.ago(0), aiSummary: 'Inquired about software, website, and booking systems via WhatsApp webhook.' },
  { id: 2,  name: 'WhatsApp Contact (+917907771992)', phone: '+917907771992', company: 'Inbound WhatsApp', email: 'contact.917907771992@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: 'Today 06:42', date: NB.ago(0), aiSummary: 'Received real inbound message via WhatsApp webhook.' },
  { id: 3,  name: 'WhatsApp Contact (+919154958908)', phone: '+919154958908', company: 'Inbound WhatsApp', email: 'contact.919154958908@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: 'Yesterday 21:46', date: NB.ago(1), aiSummary: 'Received real inbound message via WhatsApp webhook.' },
  { id: 4,  name: 'WhatsApp Contact (+919539638371)', phone: '+919539638371', company: 'Inbound WhatsApp', email: 'contact.9539638371@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: 'Yesterday 18:13', date: NB.ago(1), aiSummary: 'Received real inbound message via WhatsApp webhook.' },
  { id: 5,  name: 'WhatsApp Contact (+918097097504)', phone: '+918097097504', company: 'Inbound WhatsApp', email: 'contact.918097097504@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: 'Yesterday 12:39', date: NB.ago(1), aiSummary: 'Received real inbound message via WhatsApp webhook.' },
  { id: 6,  name: 'WhatsApp Contact (+919188786637)', phone: '+919188786637', company: 'Inbound WhatsApp', email: 'contact.9188786637@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '3 days ago', date: NB.ago(3), aiSummary: 'Received real inbound message via WhatsApp webhook.' },
  { id: 7,  name: 'WhatsApp Contact (+916381284524)', phone: '+916381284524', company: 'Inbound WhatsApp', email: 'contact.6381284524@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '2 days ago', date: NB.ago(2), aiSummary: 'Sent voice note and text messages. Expressed interest.' },
  { id: 8,  name: 'WhatsApp Contact (+447974905007)', phone: '+447974905007', company: 'Inbound WhatsApp UK', email: 'contact.447974905007@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '5 days ago', date: NB.ago(5), aiSummary: 'UK-based lead inquiring about international WhatsApp API and CRM pricing.' },
  { id: 9,  name: 'WhatsApp Contact (+917058069655)', phone: '+917058069655', company: 'Inbound WhatsApp', email: 'contact.917058069655@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '2 days ago', date: NB.ago(2), aiSummary: 'Inquired about WhatsApp appointment bot for clinics.' },
  { id: 10, name: 'WhatsApp Contact (+919971007221)', phone: '+919971007221', company: 'Inbound WhatsApp', email: 'contact.919971007221@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '4 days ago', date: NB.ago(4), aiSummary: 'Coaching institute in Delhi. Needs CRM and WhatsApp auto-responder.' },
  { id: 11, name: 'WhatsApp Contact (+917349798388)', phone: '+917349798388', company: 'Inbound WhatsApp', email: 'contact.917349798388@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '6 days ago', date: NB.ago(6), aiSummary: 'Salon owner in Coimbatore. Interested in slot booking bot.' },
  { id: 12, name: 'WhatsApp Contact (+918928814237)', phone: '+918928814237', company: 'Inbound WhatsApp', email: 'contact.918928814237@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '6 days ago', date: NB.ago(6), aiSummary: 'Automobile service garage inquiring about service reminder automation.' },
  { id: 13, name: 'WhatsApp Contact (+917303039276)', phone: '+917303039276', company: 'Inbound WhatsApp', email: 'contact.917303039276@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '2 days ago', date: NB.ago(2), aiSummary: 'Fitness studio. Wants auto follow-up for leads.' },
  { id: 14, name: 'WhatsApp Contact (+919205831350)', phone: '+919205831350', company: 'Inbound WhatsApp', email: 'contact.919205831350@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '7 days ago', date: NB.ago(7), aiSummary: 'Dental clinic seeking WhatsApp appointment booking bot.' },
  { id: 15, name: 'WhatsApp Contact (+919029108282)', phone: '+919029108282', company: 'Inbound WhatsApp', email: 'contact.9029108282@whatsapp.com', source: 'Meta Webhook', status: 'Replied', score: 75, assigned: 'Praveenkumar', lastActivity: '2 days ago', date: NB.ago(2), aiSummary: 'Inquiring about WhatsApp marketing automation.' },
  { id: 16, name: 'Dr. Jacob Mathew', phone: '+91 94470 12345', company: 'Dr. Jacob Dental & Implant Center', email: 'dr.jacob@dentalcenter.in', source: 'WhatsApp', status: 'Qualified', score: 88, assigned: 'Praveenkumar', lastActivity: '45m ago', date: NB.ago(0) },
  { id: 17, name: 'Rahul Shenoy', phone: '+91 98860 55432', company: 'Spice Craft Bistro & Brews', email: 'rahul@spicecraft.in', source: 'WhatsApp', status: 'Proposal', score: 82, assigned: 'Praveenkumar', lastActivity: '1h ago', date: NB.ago(0) },
  { id: 18, name: 'Sarah Jenkins', phone: '+1 415 555 2671', company: 'Jenkins Aesthetics & Salon', email: 'sarah.j@instagram.com', source: 'Instagram', status: 'New', score: 70, assigned: 'Praveenkumar', lastActivity: '15m ago', date: NB.ago(0) },
  { id: 19, name: 'Marcus Vance', phone: '+1 212 901 8844', company: 'Vance Auto Care Garage', email: 'marcus@vancemedia.com', source: 'Instagram', status: 'Contacted', score: 65, assigned: 'Diana Lee', lastActivity: '3h ago', date: NB.ago(0) },
  { id: 20, name: 'Alice Green', phone: '+91 927 455 8824', company: 'Green Consulting Hub', email: 'alice.green@company.com', source: 'Website', status: 'New', score: 60, assigned: 'Praveenkumar', lastActivity: '2 hours ago', date: NB.ago(0) },
  { id: 21, name: 'Bob Johnson', phone: '+91 872 878 0000', company: 'Johnson Auto Spares', email: 'bob.j@johnsonauto.com', source: 'Instagram', status: 'Contacted', score: 55, assigned: 'Praveenkumar', lastActivity: '4 hours ago', date: NB.ago(1) },
  { id: 22, name: 'Charlie Davis', phone: '+91 952 677 2251', company: 'Davis Architecture', email: 'charlie.davis@enterprise.com', source: 'Facebook', status: 'Qualified', score: 90, assigned: 'Chana Lee', lastActivity: '1 day ago', date: NB.ago(3) },
  { id: 23, name: 'Diana Lee', phone: '+91 952 928 4525', company: 'Lee Studio', email: 'diana.lee@solutions.org', source: 'WhatsApp', status: 'Proposal', score: 85, assigned: 'Praveenkumar', lastActivity: '2 days ago', date: NB.ago(5) }
];

/* ---- Customers ---- */
NB.customers = [
  { id:1, name:'Ethan Hall',    phone:'+91 932 936 7737', company:'Hall Enterprises',  revenue:'₹1,25,000', assigned:'Diana Lee',    lastContact: NB.ago(2)  },
  { id:2, name:'Priya Sharma',  phone:'+91 987 654 3210', company:'Sharma & Co',       revenue:'₹98,500',   assigned:'Praveenkumar', lastContact: NB.ago(5)  },
  { id:3, name:'Raj Menon',     phone:'+91 900 111 2222', company:'Menon Retail',      revenue:'₹2,40,000', assigned:'Chana Lee',    lastContact: NB.ago(8)  },
  { id:4, name:'Sunita Pillai', phone:'+91 877 332 1100', company:'Pillai Industries', revenue:'₹75,000',   assigned:'Praveenkumar', lastContact: NB.ago(12) },
];

/* ---- Deals ---- */
NB.deals = {
  'New':         [ { id:1, name:'Website Redesign',    customer:'Alice Green',  amount:'₹45,000',  prob:'30%',  probClass:'prob-low',    owner:'Praveenkumar', lastActivity:'Today'     } ],
  'Contacted':   [ { id:2, name:'SEO Campaign',        customer:'Bob Johnson',  amount:'₹80,000',  prob:'50%',  probClass:'prob-medium', owner:'Diana Lee',    lastActivity:'Yesterday' },
                   { id:3, name:'Social Media Mgmt',   customer:'Hannah Martin',amount:'₹35,000',  prob:'45%',  probClass:'prob-medium', owner:'Chana Lee',    lastActivity:'2d ago'    } ],
  'Proposal':    [ { id:4, name:'CRM Integration',     customer:'Charlie Davis',amount:'₹1,20,000',prob:'65%',  probClass:'prob-medium', owner:'Praveenkumar', lastActivity:'Today'     } ],
  'Negotiation': [ { id:5, name:'ERP Software',        customer:'Diana Lee',    amount:'₹2,50,000',prob:'75%',  probClass:'prob-high',   owner:'Praveenkumar', lastActivity:'1h ago'    } ],
  'Won':         [ { id:6, name:'Annual Support Plan',  customer:'Ethan Hall',   amount:'₹1,25,000',prob:'100%', probClass:'prob-high',   owner:'Diana Lee',    lastActivity:'3d ago'    } ],
  'Lost':        [ { id:7, name:'Mobile App Dev',      customer:'Fiona Clarke', amount:'₹3,00,000',prob:'0%',   probClass:'prob-low',    owner:'Praveenkumar', lastActivity:'5d ago'    } ],
};

/* ---- Calls ---- */
NB.calls = [
  { dir:'in',  customer:'Alice Green',   phone:'+91 927 455 8824', duration:'5:32', status:'Completed', recording:true,  date:NB.ago(0) },
  { dir:'out', customer:'Bob Johnson',   phone:'+91 872 878 0000', duration:'2:18', status:'Completed', recording:true,  date:NB.ago(0) },
  { dir:'out', customer:'Charlie Davis', phone:'+91 952 677 2251', duration:'0:45', status:'No Answer', recording:false, date:NB.ago(1) },
  { dir:'in',  customer:'Diana Lee',     phone:'+91 952 928 4525', duration:'12:05',status:'Completed', recording:true,  date:NB.ago(1) },
  { dir:'out', customer:'George W.',     phone:'+91 799 111 2233', duration:'3:20', status:'Completed', recording:false, date:NB.ago(2) },
  { dir:'in',  customer:'Hannah Martin', phone:'+91 700 998 8776', duration:'1:09', status:'Missed',    recording:false, date:NB.ago(2) },
];

/* ---- Conversations ---- */
NB.conversations = [
  /* ======= REAL WHATSAPP WEBHOOK CONTACTS ======= */
  {
    id: 'conv_wa_8111986637',
    name: 'WhatsApp Contact (+918111986637)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+918111986637',
    email: 'contact.918111986637@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'I need software',
    time: '13:58',
    unread: false,
    messages: [
      { dir: 'in', text: 'I need a website connect sales team', time: '08:31' },
      { dir: 'out', isAI: true, text: 'Hello! I would be glad to help you set up your website and CRM. What features do you need?', time: '08:31' },
      { dir: 'in', text: 'I need a booking software for clinic & salon appointments', time: '08:42' },
      { dir: 'out', isAI: true, text: 'We have full automated WhatsApp appointment booking with slot reminders and calendar sync. Would you like a demo?', time: '08:42' },
      { dir: 'in', text: 'You are a senior n8n automation engineer and sales consultant. Build me a WhatsApp AI Sales Agent system in n8n.', time: '09:35' },
      { dir: 'in', text: 'Done! Congratulations on your new bot. You will find it at t.me/nextbright_alerts_bot\n\nToken: 8933244287:AAHHRdcQbGQsihS6Zom0sWxyvn4yw1UdxA4', time: '09:51' },
      { dir: 'out', isAI: true, text: 'Congratulations on your new bot! If you need help configuring it, feel free to ask. What would you like to customise first?', time: '09:51' },
      { dir: 'in', text: 'git clone https://github.com/harry0703/MoneyPrinterTurbo.git\ncd MoneyPrinterTurbo\npip install -r requirements.txt', time: '20:24' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '20:24' },
      { dir: 'in', text: 'I am using Pexels videos in a personal tool that makes short videos automatically from a text topic.', time: '21:23' },
      { dir: 'out', isAI: true, text: 'That sounds like a great tool! How can I assist you with it today?', time: '21:23' },
      { dir: 'in', text: 'Hi', time: '13:56' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '13:56' },
      { dir: 'in', text: 'I need software', time: '13:58' },
      { dir: 'out', isAI: true, text: 'Hi! What kind of software are you looking for? We specialise in WhatsApp CRM, booking systems, and AI automation.', time: '13:58' }
    ]
  },
  {
    id: 'conv_wa_7907771992',
    name: 'WhatsApp Contact (+917907771992)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+917907771992',
    email: 'contact.917907771992@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Absolutely — ready to arrange a quick demo.',
    time: '06:42',
    unread: false,
    messages: [
      { dir: 'in', text: 'ഈ നമ്പർ ഇന്ന് കട്ട് ചെയ്യുന്നലിസ്റ്റിൽ വന്നിട്ടുണ്ട്. ഇന്നും കൂടെ മാത്രം ആണ് ഇതിൽ റീചാർജ് ചെയ്യാൻ ടൈം തന്നിട്ടുള്ളത്.\n*Minimum plan👇🏻\n*👉239 1.5 gb/day 22 days*\n*👉299 unlimited call 1.5Gb/day 28 days*\n*👉349 unlimited Call unlimited 5G Data 28 days\n\n *Team Jio*', time: '06:42' },
      { dir: 'out', isAI: true, text: 'Absolutely — I\'d be happy to arrange a quick demo. What day and time work best for you?', time: '06:42' }
    ]
  },
  {
    id: 'conv_wa_9154958908',
    name: 'WhatsApp Contact (+919154958908)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+919154958908',
    email: 'contact.919154958908@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Hi, I have a query about your WhatsApp automation services.',
    time: '21:46',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi, I have a query about your WhatsApp automation services.', time: '21:46' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for contacting NextBright Solutions. How can we help your business today?', time: '21:47' }
    ]
  },
  {
    id: 'conv_wa_9539638371',
    name: 'WhatsApp Contact (+919539638371)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+919539638371',
    email: 'contact.9539638371@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Absolutely — ready to arrange a quick demo.',
    time: '18:13',
    unread: false,
    messages: [
      { dir: 'in', text: 'ഈ നമ്പർ ഇന്ന് കട്ട് ചെയ്യുന്നലിസ്റ്റിൽ വന്നിട്ടുണ്ട്. ഇന്നും കൂടെ മാത്രം ആണ് ഇതിൽ റീചാർജ് ചെയ്യാൻ ടൈം തന്നിട്ടുള്ളത്.\n*Minimum plan👇🏻\n*👉239 1.5 gb/day 22 days*\n*👉299 unlimited call 1.5Gb/day 28 days*\n*👉349 unlimited Call unlimited 5G Data 28 days\n\n *Team Jio*', time: '18:13' },
      { dir: 'out', isAI: true, text: 'Absolutely — I\'d be happy to arrange a quick demo. What day and time work best for you?', time: '18:13' }
    ]
  },
  {
    id: 'conv_wa_8097097504',
    name: 'WhatsApp Contact (+918097097504)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+918097097504',
    email: 'contact.918097097504@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Hi! Thanks for getting in touch.',
    time: '12:39',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi, I need info about your CRM.', time: '12:39' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I assist you today?', time: '12:40' }
    ]
  },
  {
    id: 'conv_wa_9188786637',
    name: 'WhatsApp Contact (+919188786637)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+919188786637',
    email: 'contact.9188786637@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Hi! Thanks for getting in touch.',
    time: '21:09',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi', time: '21:09' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '21:09' }
    ]
  },
  {
    id: 'conv_wa_6381284524',
    name: 'WhatsApp Contact (+916381284524)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+916381284524',
    email: 'contact.6381284524@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Interest iruintha sollu',
    time: '22:06',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi', time: '13:31' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '13:31' },
      { dir: 'in', text: 'Hi', time: '13:34' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '13:34' },
      { dir: 'in', type: 'audio', text: '🎤 Voice message (audio note)', time: '13:29' },
      { dir: 'in', text: 'Interest iruintha sollu', time: '13:29' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '13:29' },
      { dir: 'in', text: 'Kekuraa', time: '13:29' },
      { dir: 'in', text: 'Praveen', time: '14:01' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '14:01' },
      { dir: 'in', text: 'Mm', time: '22:06' },
      { dir: 'out', isAI: true, text: 'Hi! Thanks for getting in touch. How can I help you today?', time: '22:06' }
    ]
  },
  {
    id: 'conv_wa_447974905007',
    name: 'WhatsApp Contact (+447974905007)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp UK',
    phone: '+447974905007',
    email: 'contact.447974905007@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Inquiring about international WhatsApp API pricing.',
    time: '22:36',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hello, inquiring about international WhatsApp API setup and CRM pricing.', time: '22:34' },
      { dir: 'in', text: 'We are a UK-based consultancy and need a multi-agent inbox.', time: '22:36' },
      { dir: 'out', isAI: true, text: 'Hi! We support global WhatsApp Business API with multi-currency billing and multi-agent shared inboxes. How can I help you today?', time: '22:37' }
    ]
  },
  {
    id: 'conv_wa_7058069655',
    name: 'WhatsApp Contact (+917058069655)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+917058069655',
    email: 'contact.917058069655@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Yes, please share the details.',
    time: '14:16',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi, I saw your post on WhatsApp appointment bot for clinics.', time: '17:42' },
      { dir: 'out', isAI: true, text: 'Hello! Yes, we build complete automated WhatsApp booking workflows with live calendar sync. Would you like a 2-minute demo?', time: '17:43' },
      { dir: 'in', text: 'Yes, please share the details.', time: '14:16' }
    ]
  },
  {
    id: 'conv_wa_9971007221',
    name: 'WhatsApp Contact (+919971007221)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+919971007221',
    email: 'contact.919971007221@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Tomorrow at 4 PM works best.',
    time: '17:35',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi Praveen, we need a CRM and WhatsApp auto-responder for our coaching institute in Delhi.', time: '21:00' },
      { dir: 'out', isAI: true, text: 'Hi! NextBright CRM includes automated student enquiry capture, lead scoring, and instant WhatsApp brochures. What is the best time for a demo call?', time: '21:01' },
      { dir: 'in', text: 'Tomorrow at 4 PM works best.', time: '17:35' }
    ]
  },
  {
    id: 'conv_wa_7349798388',
    name: 'WhatsApp Contact (+917349798388)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+917349798388',
    email: 'contact.917349798388@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Interested in salon slot booking automation.',
    time: '17:47',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi, interested in slot booking bot for salon in Coimbatore.', time: '17:47' },
      { dir: 'out', isAI: true, text: 'Vanakkam! We have pre-built salon slot booking templates with stylist selection and advance payments. Can I share a quick sample link?', time: '17:48' }
    ]
  },
  {
    id: 'conv_wa_8928814237',
    name: 'WhatsApp Contact (+918928814237)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+918928814237',
    email: 'contact.918928814237@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Vehicle service appointment booking inquiry.',
    time: '14:15',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hello, do you support automobile service garage service reminders?', time: '14:15' },
      { dir: 'out', isAI: true, text: 'Vanakkam! Yes, vehicle service reminders and appointment scheduling is our strongest specialty. We can set up automated 3-month/6-month periodic maintenance reminders.', time: '14:16' }
    ]
  },
  {
    id: 'conv_wa_7303039276',
    name: 'WhatsApp Contact (+917303039276)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+917303039276',
    email: 'contact.917303039276@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Great, please send demo video.',
    time: '15:05',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi, need auto follow-up system for fitness studio leads.', time: '18:04' },
      { dir: 'out', isAI: true, text: 'Hi! Our system automatically nurtures trial gym inquiries with timed WhatsApp offers and membership packages.', time: '18:05' },
      { dir: 'in', text: 'Great, please send demo video.', time: '15:05' }
    ]
  },
  {
    id: 'conv_wa_9205831350',
    name: 'WhatsApp Contact (+919205831350)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+919205831350',
    email: 'contact.919205831350@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Need WhatsApp appointment bot for dental clinic.',
    time: '17:12',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hello, need WhatsApp appointment bot for dental clinic.', time: '17:12' },
      { dir: 'out', isAI: true, text: 'Hi Doctor! We have turnkey dental booking templates with 24/7 AI qualification. What time works best for a walkthrough?', time: '17:13' }
    ]
  },
  {
    id: 'conv_wa_9029108282',
    name: 'WhatsApp Contact (+919029108282)',
    initials: 'WA',
    channel: 'whatsapp',
    company: 'Inbound WhatsApp',
    phone: '+919029108282',
    email: 'contact.9029108282@whatsapp.com',
    source: 'Meta Webhook',
    status: 'Replied',
    preview: 'Can we connect tomorrow?',
    time: '03:03',
    unread: false,
    messages: [
      { dir: 'in', text: 'Hi, are you available to discuss WhatsApp marketing automation?', time: '16:43' },
      { dir: 'out', isAI: true, text: 'Hi! Yes absolutely, we provide official Meta Cloud API integration with broadcast campaigns & AI sales agents.', time: '16:45' },
      { dir: 'in', text: 'Can we connect tomorrow?', time: '03:03' }
    ]
  },

  /* ======= OUTREACH / BUSINESS CONTACTS ======= */
  {
    id: 'conv_001',
    name: 'Dr. Jacob Mathew',
    initials: 'JM',
    channel: 'whatsapp',
    company: 'Dr. Jacob Dental & Implant Center',
    phone: '+91 94470 12345',
    email: 'dr.jacob@dentalcenter.in',
    source: 'WhatsApp Business',
    status: 'Qualified',
    preview: 'We have 3 branches in Ernakulam. Can we see a live demo?',
    time: '45m',
    unread: false,
    messages: [
      { dir: 'system', text: 'Campaign "Kerala Dental Clinics Outreach" started. Template healthcare_appointment_intro_v2 dispatched.', time: '10:15 AM' },
      { dir: 'out', text: 'Hi Dr. Jacob, noticed Dr. Jacob Dental & Implant Center in Kochi. Are you still handling clinic patient bookings manually? We helped dental clinics increase appointment shows by 40% with automated WhatsApp recalls. Open to a 5-min demo?', time: '10:15 AM' },
      { dir: 'in', text: 'Hello, yes we currently use front-desk phone calls which takes too much time. What does this software cost and how does it sync with dental appointments?', time: '2:10 PM' },
      { dir: 'out', isAI: true, text: 'Thanks for reaching out Dr. Jacob! Our AI automatically sends WhatsApp reminder confirmations 24h & 2h before appointments, allowing patients to confirm or reschedule in 1 click. We support standard clinic workflows. Our growth package starts at ₹3,999/mo for up to 3 doctor chairs.', time: '2:11 PM' },
      { dir: 'in', text: 'Sounds promising. We have 3 branches in Ernakulam with 6 consulting doctors. Can we see a live demonstration with our team?', time: '2:30 PM' },
      { dir: 'out', isAI: true, text: 'Sure Doctor Jacob! I can book a 15-min zoom walkthrough tomorrow at 11:30 AM or 3:00 PM. Which works best?', time: '2:32 PM' },
      { dir: 'in', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1629909615957-be38d48fbbe4?w=480&q=80', caption: 'Our current clinic reception setup 🏥', text: 'Here is our front desk setup.', time: '2:35 PM' }
    ]
  },
  {
    id: 'conv_002',
    name: 'Rahul Shenoy',
    initials: 'RS',
    channel: 'whatsapp',
    company: 'Spice Craft Bistro & Brews',
    phone: '+91 98860 55432',
    email: 'rahul@spicecraft.in',
    source: 'WhatsApp Business',
    status: 'Proposal',
    preview: 'Can we do a pilot run this weekend at our Indiranagar outlet?',
    time: '1h',
    unread: true,
    messages: [
      { dir: 'out', text: 'Hello Rahul! Loved the dining vibe at Spice Craft Bistro & Brews. Did you know direct WhatsApp table reservations can save up to 25% on aggregator fees? Would you like to see how Bangalore restaurants automate VIP bookings?', time: '11:00 AM' },
      { dir: 'in', text: 'Interesting! Can it integrate with our Petpooja POS billing system?', time: '11:42 AM' },
      { dir: 'out', isAI: true, text: 'Yes Rahul! We have direct Petpooja webhook support. Table reservations and VIP billing bills sync in real-time.', time: '11:43 AM' },
      { dir: 'system', text: 'Human Takeover triggered by Vikram Mehta. AI auto-reply paused.', time: '12:00 PM' },
      { dir: 'out', text: 'Hi Rahul, Vikram here! Just shared our custom hospitality proposal on your email rahul@spicecraft.in. Let me know if you need any adjustments.', time: '12:30 PM' },
      { dir: 'in', text: 'We received the proposal document Vikram. Can we do a pilot run this weekend at our Indiranagar outlet?', time: '1:45 PM' }
    ]
  },

  /* ======= INSTAGRAM CONTACTS ======= */
  {
    id: 'conv_003',
    name: 'Sarah Jenkins',
    initials: 'SJ',
    channel: 'instagram',
    company: 'Jenkins Aesthetics & Salon',
    phone: '+1 415 555 2671',
    email: 'sarah.j@instagram.com',
    source: 'Instagram Direct',
    status: 'New',
    preview: 'Can you send the pricing for your automated DM engine?',
    time: '15m',
    unread: true,
    messages: [
      { dir: 'in', text: 'Hey! Saw your Instagram post on automated customer responses. Does it work for IG DMs?', time: '11:00 AM' },
      { dir: 'out', isAI: true, text: 'Yes Sarah! Our Instagram integration automatically responds to DMs and story mentions in real time.', time: '11:05 AM' },
      { dir: 'in', text: 'Can you send the pricing for your automated DM engine?', time: '11:12 AM' }
    ]
  },
  {
    id: 'conv_005',
    name: 'Marcus Vance',
    initials: 'MV',
    channel: 'instagram',
    company: 'Vance Auto Care Garage',
    phone: '+1 212 901 8844',
    email: 'marcus@vancemedia.com',
    source: 'Instagram Direct',
    status: 'Contacted',
    preview: 'Interested in the IG Lead Gen flow.',
    time: '3h',
    unread: false,
    messages: [
      { dir: 'in', text: 'Loved the IG story lead magnet! How does lead capturing work via IG comment triggers?', time: '8:45 AM' },
      { dir: 'out', isAI: true, text: 'When users comment a keyword on your IG posts, our system automatically sends them a DM with your link and logs them into CRM.', time: '8:50 AM' }
    ]
  },

  /* ======= OTHER CHANNELS ======= */
  {
    id: 'conv_006',
    name: 'Alice Green',
    initials: 'AG',
    channel: 'whatsapp',
    company: 'Green Consulting Hub',
    phone: '+91 927 455 8824',
    email: 'alice.green@company.com',
    source: 'WhatsApp',
    status: 'New',
    preview: 'Thanks, I wanted to follow up on the proposal.',
    time: '2m',
    unread: true,
    messages: [
      { dir: 'in', text: 'Hi! I\'m interested in your CRM solution.', time: '10:20 AM' },
      { dir: 'out', text: 'Great to hear! I\'ll send you the details now.', time: '10:22 AM' },
      { dir: 'in', text: 'Thanks, I wanted to follow up on the proposal.', time: '10:35 AM' }
    ]
  },
  {
    id: 'conv_009',
    name: 'Charlie Davis',
    initials: 'CD',
    channel: 'email',
    company: 'Davis Architecture',
    phone: '+91 952 677 2251',
    email: 'charlie.davis@enterprise.com',
    source: 'Email',
    status: 'Proposal',
    preview: 'Invoice sent to your email. Please check!',
    time: '2d',
    unread: false,
    messages: [
      { dir: 'in', text: 'Please send the invoice at your earliest.', time: '8:00 AM' },
      { dir: 'out', text: 'Invoice sent to your email. Please check!', time: '8:05 AM' }
    ]
  },
  {
    id: 'conv_010',
    name: 'Diana Lee',
    initials: 'DL',
    channel: 'sms',
    company: 'Lee Studio',
    phone: '+91 952 928 4525',
    email: 'diana.lee@solutions.org',
    source: 'SMS',
    status: 'Converted',
    preview: 'Looking forward to onboarding!',
    time: '3d',
    unread: false,
    messages: [
      { dir: 'out', text: 'Welcome aboard, Diana! Ready for onboarding.', time: 'Yesterday' },
      { dir: 'in', text: 'Looking forward to it!', time: 'Yesterday' }
    ]
  }
];

/* ---- Appointments ---- */
NB.appointments = [
  { customer:'Alice Green',   type:'Discovery Call',     date:'Today 2:00 PM',   assigned:'Praveenkumar', status:'Upcoming' },
  { customer:'Bob Johnson',   type:'Product Demo',       date:'Today 4:30 PM',   assigned:'Diana Lee',    status:'Upcoming' },
  { customer:'Charlie Davis', type:'Proposal Review',    date:'Tomorrow 10:00 AM',assigned:'Praveenkumar', status:'Scheduled' },
  { customer:'Priya Sharma',  type:'Onboarding Session', date:'Fri 11:00 AM',    assigned:'Chana Lee',    status:'Scheduled' },
];

/* ---- Tasks ---- */
NB.tasks = [
  { title:'Call new leads',                         time:'10:00 AM', priority:'High',   done:false },
  { title:'Follow up with Rahul S',                 time:'11:30 AM', priority:'Medium', done:true  },
  { title:'Send proposal to Anjali P',              time:'2:00 PM',  priority:'High',   done:false },
  { title:'Client meeting',                         time:'4:00 PM',  priority:'Medium', done:false },
  { title:'Review pipeline report',                 time:'5:00 PM',  priority:'Low',    done:false },
  { title:'Complete activity log for Diana Lee',     time:'EOD',      priority:'Low',    done:true  },
];

/* ---- Activity ---- */
NB.activityFeed = [
  { icon:'user-plus',      color:'blue',   text:'New lead received',        sub:'Rahul S from Website',     time:'2m ago'  },
  { icon:'phone',          color:'green',  text:'Call completed',           sub:'Spoke with Anjali P',      time:'12m ago' },
  { icon:'message-circle', color:'purple', text:'New message',              sub:'Customer inquiry received', time:'18m ago' },
  { icon:'briefcase',      color:'orange', text:'Deal moved to Proposal',   sub:'Vishnu K · Premium',        time:'32m ago' },
  { icon:'calendar',       color:'teal',   text:'Appointment scheduled',    sub:'Salon Demo Meeting',        time:'1h ago'  },
];
