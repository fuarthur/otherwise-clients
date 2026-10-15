const copy = {
  test:['Test saved connection','测试已保存的连接'], retry:['Test again','重新检测'],
  checking:['Checking the service…','正在检测服务…'],
  untested:['Test the saved address and access code without sending your interests.','检测已保存的地址和访问码，不发送你的兴趣。'],
  draft:['Save your connection edits before testing.','请先保存连接设置的修改，再进行检测。'],
  ready:['The recommendation service is ready.','推荐服务已就绪。'],
  warming:['The model is not ready. Check the service startup window, then test again.','模型尚未就绪，请查看服务启动窗口后重新检测。'],
  discovery_unavailable:['Broad topics are ready. Specific concepts are unavailable; check or restart the service before using them.','宽泛主题服务已就绪，具体概念服务不可用。使用具体概念前，请检查或重新启动服务。'],
  unauthorized:['The access code was not accepted. Update it below, save, then test again.','访问码未被接受。请在下方修改并保存，再重新检测。'],
  forbidden:['The service refused this connection. Check the service address and access settings.','服务拒绝了此连接，请检查服务地址和访问设置。'],
  permission_required:['Browser access is missing. Save the connection below and allow access when Chrome asks.','浏览器访问权限未开启，请保存下方连接设置，并允许 Chrome 请求的访问权限。'],
  unreachable:['Cannot reach the service. For local use, open Start-OtherWise-Local.command. For a shared service, check its current address. Then test again.','无法连接服务。本地使用时，请打开 Start-OtherWise-Local.command；共享服务请确认当前地址，然后重新检测。'],
  timeout:['The service did not answer in time. Check that it is running, then test again.','服务未及时响应，请确认服务正在运行后重新检测。'],
  incompatible:['This address did not return a supported OtherWise status. Check the address or update the service.','此地址未返回支持的 OtherWise 状态，请检查地址或更新服务。'],
  missing_configuration:['Enter and save the service address and, for a shared service, its access code.','请填写并保存服务地址；共享服务还需要访问码。'],
  preview_unavailable:['Connection testing is available in the installed extension.','请在安装后的扩展中检测连接。'],
};
export const connectionText=(language,key)=>copy[key]?.[language==='zh-CN'?1:0] || '';
export function connectionStatusView(result,{language='en',pending=false,dirty=false}={}) {
  const t=key=>connectionText(language,key);
  const status=pending?'checking':result?.status || 'untested';
  return `<div class="service-check"><p class="small" id="connection-check-status" role="status" data-status="${Object.hasOwn(copy,status)?status:'untested'}">${t(status) || t('untested')}</p><button type="button" data-action="check-connection" data-focus="check-connection"${pending || dirty?' disabled':''}>${t(result?'retry':'test')}</button><p class="muted small" id="connection-check-draft"${dirty?'':' hidden'}>${t('draft')}</p></div>`;
}
