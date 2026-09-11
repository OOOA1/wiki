import {marked} from 'marked';
import sanitizeHtml from 'sanitize-html';
import type {Validation} from './types';
export const MAX_CONTENT=250000;
export function validateContent(content:string,format:'markdown'|'html'):Validation {
 if(content.length>MAX_CONTENT)throw new Error('Статья слишком большая. Максимум — 250 000 символов.');
 const warnings:string[]=[];
 if(!content.trim())warnings.push('Добавьте текст статьи.');
 if(format==='markdown'){
  let fence:{char:string;size:number;line:number}|null=null;
  content.split('\n').forEach((line,i)=>{const m=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);if(!m)return;if(!fence)fence={char:m[1][0],size:m[1].length,line:i+1};else if(m[1][0]===fence.char&&m[1].length>=fence.size&&!m[2].trim())fence=null;});
  if(fence)warnings.push('Незакрытый блок кода: добавьте закрывающую строку ``` или ~~~.');
 }
 const parsed=format==='markdown'?marked.parse(content,{async:false,gfm:true,breaks:false}) as string:content;
 const allowedTags=['p','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','u','blockquote','ul','ol','li','pre','code','a','img','video','source','table','thead','tbody','tr','th','td','caption','details','summary','span','div','figure','figcaption'];
 if(/<(script|iframe|object|embed|style|form|input|svg|math|link|meta)\b/i.test(parsed)||/\son[a-z]+\s*=/i.test(parsed)||/(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data):/i.test(parsed))warnings.push('Небезопасный HTML удалён: скрипты, обработчики событий и встроенные формы не поддерживаются.');
 const html=sanitizeHtml(parsed,{allowedTags,allowedAttributes:{a:['href','title','target','rel'],img:['src','alt','title','width','height','loading','referrerpolicy'],video:['src','controls','preload','width'],source:['src','type'],code:['class'],th:['colspan','rowspan'],td:['colspan','rowspan'],ol:['start'],details:['open']},allowedClasses:{code:['language-*']},allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,transformTags:{a:(_tag,attr)=>({tagName:'a',attribs:{...attr,target:'_blank',rel:'noopener noreferrer'}}),img:(_tag,attr)=>({tagName:'img',attribs:{...attr,loading:'lazy',referrerpolicy:'no-referrer'}}),video:(_tag,attr)=>({tagName:'video',attribs:{...attr,controls:'',preload:'metadata'}})}});
 const plain=sanitizeHtml(html,{allowedTags:[],allowedAttributes:{}}).replace(/&[a-z0-9#]+;/gi,' ').trim();
 return {html,warnings,wordCount:plain?plain.split(/\s+/).length:0};
}
export function excerpt(content:string,format:'markdown'|'html'){return sanitizeHtml(validateContent(content,format).html,{allowedTags:[],allowedAttributes:{}}).replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0,190)}
