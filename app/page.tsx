import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import {AppError,loadWiki,member} from '@/lib/server';
import Wiki from './wiki';
import Access from './access';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getChatGPTUser();if(!user)return <Access signInHref={chatGPTSignInPath('/')} />;try{const me=await member(true);return <Wiki initialData={await loadWiki(me)}/>}catch(error){if(error instanceof AppError&&error.status===403)return <Access name={user.fullName||user.email.split('@')[0]}/>;console.error('Wiki page unavailable',error instanceof Error?error.message:'Unknown error');return <Access error="Не удалось загрузить общую базу. Попробуйте обновить страницу через минуту."/>}}
