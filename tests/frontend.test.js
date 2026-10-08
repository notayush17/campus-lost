const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('frontend initializes, renders saved activity and escapes malicious text', async () => {
  const nodes = new Map();
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector,{textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},parentElement:{classList:{toggle(){}}}}); return nodes.get(selector); };
  const document = { querySelector:node,querySelectorAll:()=>[],addEventListener(){} };
  const payloads = {
    '/api/items':{items:[{id:1,title:'<img src=x onerror=alert(1)>',description:'Safe description',category:'Study',location:'Library',type:'found',createdAt:'2026-10-01',reporter:'<script>bad</script>',imageUrl:'/uploads/'+ 'a'.repeat(40)+'.jpg'}],stats:{returned:2,reports:4}},
    '/api/auth/me':{user:{id:1,name:'Ayush Kumar',role:'student',email:'student@example.test'}},
    '/api/dashboard':{reports:[{title:'Saved report',type:'lost',location:'Library',status:'pending'}],claims:[{itemTitle:'Notebook',message:'<script>bad</script>',status:'approved'}]}
  };
  const context = vm.createContext({document,console,Date,FormData:class{},fetch:async path=>({ok:true,json:async()=>payloads[path]}),window:{setTimeout(){}}});
  vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(node('#myReports').textContent,1);
  assert.equal(node('#myClaims').textContent,1);
  assert.equal(node('#myReturned').textContent,1);
  assert.equal(node('#statRecovered').textContent,2);
  assert.ok(node('#reportHistory').innerHTML.includes('Saved report'));
  assert.ok(node('#itemsGrid').innerHTML.includes('&lt;img'));
  assert.ok(node('#itemsGrid').innerHTML.includes('class="item-photo"'));
  assert.equal(vm.runInContext("photoPath('javascript:alert(1)')",context),'');
  assert.ok(!node('#itemsGrid').innerHTML.includes('<script>'));
  assert.ok(!node('#claimHistory').innerHTML.includes('<script>'));
});
