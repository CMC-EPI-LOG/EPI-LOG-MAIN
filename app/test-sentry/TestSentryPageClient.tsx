"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function TestSentryPageClient() {
  const [errorMessage, setErrorMessage] = useState<string>("");

  const triggerClientError = () => {
    try {
      // @ts-expect-error - 의도적으로 에러 발생
      undefinedFunction();
    } catch (error) {
      Sentry.captureException(error);
      setErrorMessage("클라이언트 에러가 Sentry로 전송되었습니다!");
    }
  };

  const triggerManualError = () => {
    Sentry.captureException(new Error("테스트용 수동 에러입니다"));
    setErrorMessage("수동 에러가 Sentry로 전송되었습니다!");
  };

  const triggerMessage = () => {
    Sentry.captureMessage("테스트용 Sentry 메시지입니다", "info");
    setErrorMessage("메시지가 Sentry로 전송되었습니다!");
  };

  const triggerServerError = async () => {
    try {
      const response = await fetch("/api/test-sentry-error");
      if (!response.ok) {
        throw new Error("서버 에러 발생");
      }
    } catch (error) {
      Sentry.captureException(error);
      setErrorMessage("서버 에러가 Sentry로 전송되었습니다!");
    }
  };

  const triggerAsyncError = async () => {
    try {
      await new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("비동기 에러 테스트"));
        }, 100);
      });
    } catch (error) {
      Sentry.captureException(error);
      setErrorMessage("비동기 에러가 Sentry로 전송되었습니다!");
    }
  };

  const triggerErrorWithContext = () => {
    Sentry.withScope((scope) => {
      scope.setTag("test-type", "context-error");
      scope.setLevel("error");
      scope.setContext("test-info", {
        page: "test-sentry",
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      });
      Sentry.captureException(new Error("컨텍스트 정보가 포함된 에러"));
    });
    setErrorMessage("컨텍스트 정보와 함께 에러가 전송되었습니다!");
  };

  const triggerUnhandledRejection = () => {
    Promise.reject(new Error("Unhandled Promise Rejection 테스트"));
    setErrorMessage("Unhandled Promise Rejection이 발생했습니다!");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold">Sentry 테스트 페이지</h1>
        <p className="mb-8 text-gray-600">
          아래 버튼들을 클릭하여 다양한 종류의 에러를 Sentry로 전송할 수
          있습니다.
        </p>

        {errorMessage && (
          <div className="mb-6 rounded border border-green-400 bg-green-100 p-4 text-green-700">
            {errorMessage}
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">클라이언트 사이드 에러</h2>
            <button
              onClick={triggerClientError}
              className="rounded bg-red-500 px-4 py-2 text-white transition hover:bg-red-600"
            >
              JavaScript 에러 발생
            </button>
            <p className="mt-2 text-sm text-gray-500">
              undefined 함수를 호출하여 에러를 발생시킵니다.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">수동 에러 전송</h2>
            <button
              onClick={triggerManualError}
              className="rounded bg-orange-500 px-4 py-2 text-white transition hover:bg-orange-600"
            >
              수동 에러 전송
            </button>
            <p className="mt-2 text-sm text-gray-500">
              Sentry.captureException을 사용하여 에러를 직접 전송합니다.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">메시지 전송</h2>
            <button
              onClick={triggerMessage}
              className="rounded bg-blue-500 px-4 py-2 text-white transition hover:bg-blue-600"
            >
              메시지 전송
            </button>
            <p className="mt-2 text-sm text-gray-500">
              에러가 아닌 정보 메시지를 Sentry로 전송합니다.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">서버 사이드 에러</h2>
            <button
              onClick={triggerServerError}
              className="rounded bg-purple-500 px-4 py-2 text-white transition hover:bg-purple-600"
            >
              서버 에러 발생
            </button>
            <p className="mt-2 text-sm text-gray-500">
              API 라우트에서 발생한 에러를 테스트합니다.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">비동기 에러</h2>
            <button
              onClick={triggerAsyncError}
              className="rounded bg-indigo-500 px-4 py-2 text-white transition hover:bg-indigo-600"
            >
              비동기 에러 발생
            </button>
            <p className="mt-2 text-sm text-gray-500">
              Promise를 사용한 비동기 에러를 테스트합니다.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">컨텍스트 정보 포함</h2>
            <button
              onClick={triggerErrorWithContext}
              className="rounded bg-teal-500 px-4 py-2 text-white transition hover:bg-teal-600"
            >
              컨텍스트 포함 에러 전송
            </button>
            <p className="mt-2 text-sm text-gray-500">
              추가 컨텍스트 정보와 함께 에러를 전송합니다.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">
              Unhandled Promise Rejection
            </h2>
            <button
              onClick={triggerUnhandledRejection}
              className="rounded bg-pink-500 px-4 py-2 text-white transition hover:bg-pink-600"
            >
              Unhandled Rejection 발생
            </button>
            <p className="mt-2 text-sm text-gray-500">
              처리되지 않은 Promise Rejection을 시뮬레이션합니다.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            <strong>참고:</strong> Sentry 대시보드에서 에러가 정상적으로
            전송되었는지 확인하세요. 개발 환경에서는 브라우저 콘솔에서도 Sentry
            관련 로그를 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
