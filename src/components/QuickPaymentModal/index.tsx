import React from 'react';
import { observer, useLocalStore } from 'mobx-react-lite';
import Fade from '@material-ui/core/Fade';
import Dialog from '@material-ui/core/Dialog';
import { MdInfo } from 'react-icons/md';
import classNames from 'classnames';
import Loading from 'components/Loading';
import Button from 'components/Button';
import { useStore } from 'store';
import { Finance, PrsAtm } from 'utils';

const QuickPayment = observer(() => {
  const { snackbarStore, modalStore } = useStore();
  const { props } = modalStore.quickPayment;
  const { skipVerification, done, currency, amount } = props;
  const state = useLocalStore(() => ({
    step: 1,
    paymentUrl: '',
    iframeLoading: false,
    accountName: '',
  }));

  React.useEffect(() => {
    (async () => {
      const result = Finance.checkAmount(amount, currency);
      if (result.ok) {
        if (skipVerification) {
          (async () => {
            state.iframeLoading = true;
            state.step = 2;
            try {
              state.paymentUrl = await props.pay();
            } catch (err) {
              console.log(err);
            }
          })();
        } else {
          modalStore.verification.show({
            pass: (privateKey: string, accountName: string) => {
              if (!privateKey) {
                modalStore.quickPayment.hide();
                return;
              }
              (async () => {
                state.accountName = accountName;
                state.iframeLoading = true;
                state.step = 2;
                try {
                  state.paymentUrl = await props.pay(privateKey, accountName);
                } catch (err) {
                  console.log(err);
                }
              })();
            },
          });
        }
      } else {
        snackbarStore.show(result);
      }
    })();
  }, []);

  React.useEffect(() => {
    return () => {
      PrsAtm.tryCancelPolling();
    };
  }, []);

  const Step2 = () => {
    return (
      <Fade in={true} timeout={500}>
        <div className="py-8 px-12 text-center">
          <div className="text-18 font-bold text-gray-700">Mixin 扫码支付</div>
          <div className="relative overflow-hidden">
            {state.paymentUrl && (
              <div
                className={classNames(
                  {
                    hidden: state.iframeLoading,
                  },
                  'w-64 h-64'
                )}
              >
                <iframe
                  onLoad={() => {
                    setTimeout(() => {
                      state.iframeLoading = false;
                    }, 1000);
                  }}
                  src={state.paymentUrl}
                />
                <style jsx>{`
                  iframe {
                    height: 506px;
                    width: 800px;
                    position: absolute;
                    top: -238px;
                    left: 0;
                    margin-left: -272px;
                    transform: scale(0.9);
                  }
                `}</style>
              </div>
            )}
            {state.iframeLoading && (
              <div className="w-64 h-64 flex items-center justify-center">
                <Loading size={30} />
              </div>
            )}
          </div>
          <Button
            fullWidth
            className="mt-4"
            onClick={async () => {
              state.step = 3;
              PrsAtm.polling(async () => {
                try {
                  const isDone: boolean = await props.checkResult(
                    state.accountName
                  );
                  if (isDone) {
                    done();
                    modalStore.quickPayment.hide();
                  }
                  return isDone;
                } catch (_err) {
                  return false;
                }
              }, 1000);
            }}
          >
            已支付？点击确认
          </Button>
          <div className="flex justify-center items-center mt-2 text-gray-500 text-12">
            <span className="flex items-center mr-1">
              <MdInfo className="text-16" />
            </span>
            手机还没有安装 Mixin ?
            <a
              className="text-indigo-400 ml-1"
              href="https://mixin.one/messenger"
              target="_blank"
              rel="noopener noreferrer"
            >
              前往下载
            </a>
          </div>
        </div>
      </Fade>
    );
  };

  const Step3 = () => {
    return (
      <Fade in={true} timeout={500}>
        <div className="p-8">
          <div className="w-64">
            <div className="text-gray-9b text-center">
              <div className="text-gray-700 font-bold text-18">
                Mixin 扫码支付
              </div>
              <div className="py-12 flex items-center justify-center">
                <Loading size={30} />
              </div>
              <div className="text-gray-9b text-center">
                请稍候，正在确认支付结果...
              </div>
              <div className="mt-2 text-xs text-gray-bd">
                您取消了支付？请
                <span
                  className="text-indigo-400 cursor-pointer"
                  onClick={() => {
                    state.step = 2;
                    state.iframeLoading = true;
                  }}
                >
                  返回
                </span>
                上一步
              </div>
            </div>
          </div>
        </div>
      </Fade>
    );
  };

  return (
    <Dialog
      open={state.step > 1}
      onClose={() => modalStore.quickPayment.hide()}
    >
      <div className="bg-white rounded-12 text-center">
        {state.step === 2 && Step2()}
        {state.step === 3 && Step3()}
      </div>
    </Dialog>
  );
});

export default observer(() => {
  const { modalStore } = useStore();
  const { open } = modalStore.quickPayment;

  if (!open) {
    return null;
  }

  return <QuickPayment />;
});
