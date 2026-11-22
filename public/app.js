const API = "/api";
const content = document.getElementById("content");
const title = document.getElementById("pageTitle");
const modal = document.getElementById("modal");
const form = document.getElementById("recordForm");
let currentPage = "dashboard", editingId = null, records = [];

const configs = {
  members: { label:"Members", fields:[
    ["name","Full name","text",true],["email","Email","email",true],["phone","Phone","text"],["age","Age","number"],["gender","Gender","select",false,["Male","Female","Other"]]
  ], cols:["name","email","phone","age","gender"] },
  trainers: { label:"Trainers", fields:[
    ["name","Full name","text",true],["specialization","Specialization","text",true],["phone","Phone","text"],["experience","Experience (years)","number"]
  ], cols:["name","specialization","phone","experience"] },
  plans: { label:"Membership plans", fields:[
    ["name","Plan name","text",true],["durationMonths","Duration (months)","number",true],["price","Price (₹)","number",true],["description","Description","text"]
  ], cols:["name","durationMonths","price","description"] },
  subscriptions: { label:"Subscriptions", fields:[
    ["member","Member","select",true,"members"],["plan","Plan","select",true,"plans"],["startDate","Start date","date",true],["endDate","End date","date",true],["durationMonths","Duration (months)","number",true],["status","Status","select",false,["active","expired"]]
  ], cols:["member","plan","startDate","endDate","durationMonths","status"] },
  payments: { label:"Payments", fields:[
    ["member","Member","select",true,"members"],["subscription","Subscription","select",false,"subscriptions"],["amount","Amount (₹)","number",true],["paymentDate","Payment date","date",true],["method","Payment method","select",false,["Cash","UPI","Card","Bank transfer"]],["status","Status","select",false,["paid","pending","failed"]]
  ], cols:["member","subscription","amount","paymentDate","method","status"] }
};

async function api(path, options={}) {
  const res = await fetch(API + path, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2500)}
function nice(value){return value == null ? "—" : String(value)}
function date(value){return value ? new Date(value).toLocaleDateString("en-IN") : "—"}
function display(value,key){
  if (value && typeof value === "object") return value.name || value._id || "—";
  if (key.toLowerCase().includes("date")) return date(value);
  return nice(value);
}
function escapeHtml(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

async function navigate(page){
  currentPage=page; document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  title.textContent=page==="analytics"?"Aggregations":page[0].toUpperCase()+page.slice(1);
  if(page==="dashboard") return dashboard();
  if(page==="analytics") return analytics();
  return tablePage(page);
}
async function dashboard(){
  const d=await api("/analytics/summary");
  content.innerHTML=`<div class="cards">
    ${stat("Total members",d.members,"Registered members")}${stat("Trainers",d.trainers,"Active trainer records")}${stat("Active subscriptions",d.activeSubscriptions,"Not yet expired")}${stat("Collected revenue", "₹"+d.totalRevenue.toLocaleString("en-IN"),"Paid payments")}
  </div><div class="panel"><h2>Welcome to FitCore</h2><p class="sub">Manage members, trainers, membership plans, subscriptions and payments from one place.</p><div class="toolbar"><button class="btn primary" onclick="navigate('members')">Manage members</button><button class="btn secondary" onclick="navigate('analytics')">View aggregations</button></div></div>
  <div class="panel"><h2>Project operations</h2><p class="sub">The backend exposes CRUD endpoints and MongoDB aggregation pipelines for the required analysis.</p><div class="list-row"><span>CRUD collections</span><b>5 collections</b></div><div class="list-row"><span>Aggregation reports</span><b>5 reports</b></div><div class="list-row"><span>Expired subscription archive</span><b>History retained</b></div></div>`;
}
function stat(label,value,sub){return `<div class="stat"><div class="stat-top">${label}<span>↗</span></div><strong>${value}</strong><small>${sub}</small></div>`}
async function tablePage(page,filter=""){
  const cfg=configs[page]; let url="/"+page;
  if(filter && page==="trainers") url+="?specialization="+encodeURIComponent(filter);
  records=await api(url);
  content.innerHTML=`<div class="section-head"><div><h2>${cfg.label}</h2><p class="sub">Create, view, update and delete ${cfg.label.toLowerCase()} records.</p></div><div class="toolbar">
    ${page==="trainers"?`<input id="search" class="search" placeholder="Search specialization..." value="${escapeHtml(filter)}">`:""}
    ${page==="members"?`<input id="planSearch" class="search" placeholder="Filter by plan ID">`:""}
    <button class="btn primary" id="addBtn">＋ Add ${page==="plans"?"plan":page.slice(0,-1)}</button></div></div>
    <div class="table-wrap"><table><thead><tr>${cfg.cols.map(c=>`<th>${c.replace(/([A-Z])/g," $1").toUpperCase()}</th>`).join("")}<th>ACTIONS</th></tr></thead>
    <tbody>${records.length?records.map(r=>`<tr>${cfg.cols.map(c=>`<td>${c==="price"||c==="amount"?"₹":""}${escapeHtml(display(r[c],c))}</td>`).join("")}<td><div class="actions"><button class="action" onclick="editRecord('${r._id}')">Edit</button><button class="action del" onclick="deleteRecord('${r._id}')">Delete</button></div></td></tr>`).join(""):`<tr><td colspan="${cfg.cols.length+1}" class="empty">No records yet. Use Add to create your first record.</td></tr>`}</tbody></table></div>`;
  document.getElementById("addBtn").onclick=()=>openForm(page);
  if(page==="trainers") document.getElementById("search").addEventListener("input",e=>tablePage(page,e.target.value));
  if(page==="members") document.getElementById("planSearch").addEventListener("change",async e=>{
    const id=e.target.value.trim(); if(!id) return tablePage(page);
    records=await api("/members?plan="+encodeURIComponent(id)); tablePageFromRecords(page,records);
  });
}
function tablePageFromRecords(page,data){records=data; const cfg=configs[page];const body=document.querySelector("tbody");body.innerHTML=data.length?data.map(r=>`<tr>${cfg.cols.map(c=>`<td>${escapeHtml(display(r[c],c))}</td>`).join("")}<td><div class="actions"><button class="action" onclick="editRecord('${r._id}')">Edit</button><button class="action del" onclick="deleteRecord('${r._id}')">Delete</button></div></td></tr>`).join(""):`<tr><td colspan="${cfg.cols.length+1}" class="empty">No matching members.</td></tr>`}
async function optionsFor(source){
  const data=await api("/"+source);
  return data.map(x=>({value:x._id,label:source==="members"?x.name:source==="plans"?`${x.name} (${x.durationMonths} months)`:x._id}));
}
async function openForm(page,record={}){
  editingId=record._id||null;const cfg=configs[page];document.getElementById("modalTitle").textContent=(editingId?"Edit ":"Add ")+cfg.label;
  const fields=[];
  for(const [key,label,type,required,extra] of cfg.fields){
    let input="";
    if(type==="select"){
      let opts=Array.isArray(extra)?extra.map(v=>({value:v,label:v})):await optionsFor(extra);
      if(extra==="subscriptions") opts=opts;
      input=`<select name="${key}" ${required?"required":""}><option value="">Select ${label.toLowerCase()}</option>${opts.map(o=>`<option value="${escapeHtml(o.value)}" ${String(record[key]?._id||record[key]||"")===String(o.value)?"selected":""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
    }else{
      let value=record[key]??"";
      if(type==="date"&&value)value=new Date(value).toISOString().slice(0,10);
      input=`<input name="${key}" type="${type}" value="${escapeHtml(value)}" ${required?"required":""} ${type==="number"?'min="0"':""}>`;
    }
    fields.push(`<div class="field"><label>${label}${required?" *":""}</label>${input}</div>`);
  }
  document.getElementById("formFields").innerHTML=fields.join("");modal.classList.remove("hidden");
  form.onsubmit=async e=>{
    e.preventDefault();const payload=Object.fromEntries(new FormData(form).entries());
    for(const [k,v] of Object.entries(payload)){if(v==="")delete payload[k];else if(["age","experience","durationMonths","price","amount"].includes(k))payload[k]=Number(v)}
    try{await api(`/${page}${editingId?"/"+editingId:""}`,{method:editingId?"PUT":"POST",body:JSON.stringify(payload)});closeForm();toast("Record saved");navigate(page)}
    catch(err){toast(err.message)}
  };
}
function closeForm(){modal.classList.add("hidden");form.reset();editingId=null}
async function editRecord(id){const record=records.find(r=>r._id===id);await openForm(currentPage,record||{})}
async function deleteRecord(id){if(!confirm("Delete this record? This action cannot be undone."))return;try{await api(`/${currentPage}/${id}`,{method:"DELETE"});toast("Record deleted");navigate(currentPage)}catch(e){toast(e.message)}}

async function analytics(){
  const [perPlan,revenue,popular,avg,expired]=await Promise.all([
    api("/analytics/members-per-plan"),api("/analytics/monthly-revenue"),api("/analytics/popular-plan"),api("/analytics/average-duration"),api("/analytics/expired")
  ]);
  content.innerHTML=`<div class="analytics-grid">
    <div class="panel"><h2>Members per plan</h2><p class="sub">Distinct members grouped by membership plan.</p>${perPlan.length?perPlan.map(x=>row(x.plan,x.memberCount+" members")).join(""):'<p class="empty">No subscription data.</p>'}</div>
    <div class="panel"><h2>Monthly revenue</h2><p class="sub">Sum of successful payments by month.</p>${revenue.length?revenue.map(x=>row(`${monthName(x._id.month)} ${x._id.year}`,"₹"+x.revenue.toLocaleString("en-IN"))).join(""):'<p class="empty">No payment data.</p>'}</div>
    <div class="panel"><h2>Most popular plan</h2><p class="sub">Plan with the highest number of subscriptions.</p><div class="metric">${escapeHtml(popular.plan||"—")}</div><p class="metric-label">${popular.subscriptions||0} subscriptions</p></div>
    <div class="panel"><h2>Average subscription duration</h2><p class="sub">Average duration in months.</p><div class="metric">${avg.averageMonths||0} months</div></div>
    <div class="panel"><h2>Expired memberships</h2><p class="sub">Expired records still active in subscriptions and archived history.</p>${row("Expired (not archived)",expired.expiredInSubscriptions)}${row("Archived history records",expired.archivedHistory)}<button class="btn primary" id="archiveBtn">Archive expired subscriptions</button></div>
  </div>`;
  document.getElementById("archiveBtn").onclick=async()=>{try{const r=await api("/maintenance/archive-expired",{method:"POST"});toast(r.message);analytics()}catch(e){toast(e.message)}};
}
function row(a,b){return `<div class="list-row"><span>${escapeHtml(a)}</span><b>${escapeHtml(b)}</b></div>`}
function monthName(n){return ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][n]}
document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
document.getElementById("closeModal").onclick=closeForm;document.getElementById("cancelModal").onclick=closeForm;
navigate("dashboard").catch(e=>{content.innerHTML=`<div class="panel"><h2>Cannot load dashboard</h2><p class="sub">${escapeHtml(e.message)}. Check that MongoDB is running and the backend server is started.</p></div>`});
