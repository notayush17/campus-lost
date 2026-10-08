const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campuslost-test-'));
process.env.DATA_FILE = path.join(directory, 'data.json');
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
const { server } = require('../server');
test('student/admin workflow, authorization, persistence and private assets', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method='GET', body, cookie) {
    const response = await fetch(url + route, {method, headers: {'Content-Type':'application/json', ...(cookie ? {Cookie:cookie} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status:response.status, body:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    for (const asset of ['/data.json','/server.js','/.env.example','/package.json']) assert.equal((await request(asset)).status,404);
    assert.equal((await request('/api/admin/overview')).status,401);
    assert.equal((await request('/api/auth/register','POST',{name:' ',email:'bad',password:'short'})).status,400);
    const student = await request('/api/auth/login','POST',{email:'aarav@campuslost.local',password:'Password123!'});
    assert.equal(student.status,200);
    assert.equal((await request('/api/admin/overview','GET',undefined,student.cookie)).status,403);
    const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const fields = {title:'Test photo',type:'found',category:'Accessories',location:'Library',description:'A blue backpack with a distinctive label.',date:'2026-10-01'};
    assert.equal((await request('/api/items','POST',{...fields,photo:'data:image/svg+xml;base64,PHN2Zz4='},student.cookie)).status,400);
    assert.equal((await request('/api/items','POST',{...fields,photo:'data:image/png;base64,SGVsbG8gd29ybGQ='},student.cookie)).status,400);
    assert.equal((await request('/api/items','POST',{...fields,photo:'data:image/png;base64,'+Buffer.alloc(2*1024*1024+1).toString('base64')},student.cookie)).status,413);
    const report = await request('/api/items','POST',{title:'Test backpack',type:'found',category:'Accessories',location:'Library',description:'A blue backpack with a distinctive label.',date:'2026-10-01',photo},student.cookie);
    assert.equal(report.status,201);
    const photoUrl = report.body.item.imageUrl;
    assert.match(photoUrl, /^\/uploads\/[a-f0-9]{40}\.png$/);
    assert.equal((await fetch(url+photoUrl)).status,404);
    const ownerPhoto = await fetch(url+photoUrl,{headers:{Cookie:student.cookie}});
    assert.equal(ownerPhoto.headers.get('content-type'),'image/png');
    assert.equal(ownerPhoto.status,200);
    assert.ok(Buffer.from(await ownerPhoto.arrayBuffer()).equals(Buffer.from(photo.split(',')[1],'base64')));
    assert.equal((await request('/api/items')).body.items.some(i=>i.id===report.body.item.id),false);
    const admin = await request('/api/auth/login','POST',{email:'admin@campuslost.local',password:'Admin123!'});
    assert.equal((await fetch(url+photoUrl,{headers:{Cookie:admin.cookie}})).status,200);
    assert.equal((await request(`/api/admin/items/${report.body.item.id}`,'PATCH',{status:'made-up'},admin.cookie)).status,409);
    assert.equal((await request(`/api/admin/items/${report.body.item.id}`,'PATCH',{status:'approved'},admin.cookie)).status,200);
    assert.equal((await fetch(url+photoUrl)).status,200);
    assert.equal((await request(`/api/items/${report.body.item.id}/claims`,'POST',{message:'This is my backpack with a label.'},student.cookie)).status,409);
    const claim = await request('/api/items/3/claims','POST',{message:'My notebook has my name inside its cover.'},student.cookie);
    assert.equal(claim.status,201);
    assert.equal((await request('/api/items/3/claims','POST',{message:'Duplicate claim with identifying information.'},student.cookie)).status,409);
    assert.equal((await request('/api/items/2/claims','POST',{message:'This lost listing cannot be claimed.'},student.cookie)).status,409);
    const dashboard = await request('/api/dashboard','GET',undefined,student.cookie);
    assert.equal(dashboard.body.reports.length,1);
    assert.equal(dashboard.body.claims[0].itemTitle,'Calculus notebook');
    assert.equal((await request(`/api/admin/claims/${claim.body.claim.id}`,'PATCH',{status:'approved'},admin.cookie)).status,200);
    assert.equal((await request('/api/items')).body.items.some(i=>i.id===3),false);
    assert.equal((await request('/api/dashboard','GET',undefined,student.cookie)).body.claims[0].status,'approved');
    assert.equal(JSON.parse(fs.readFileSync(process.env.DATA_FILE)).items.find(i=>i.id===3).status,'returned');
    await request('/api/auth/logout','POST',{},student.cookie);
    assert.equal((await request('/api/dashboard','GET',undefined,student.cookie)).status,401);
  } finally { await new Promise(resolve=>server.close(resolve)); fs.rmSync(directory,{recursive:true,force:true}); }
});
