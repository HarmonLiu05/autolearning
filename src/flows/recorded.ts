import type { Page } from "playwright";
import { config } from "../config.js";

export async function navigateToProblem(page: Page): Promise<Page> {
  await page.goto("https://www.educoder.net/");
  await page.getByText("登录 / 注册").click();
  await page
    .getByRole("textbox", { name: "请输入有效的手机号/邮箱号/账号" })
    .fill(config.educoderUsername);
  await page.getByRole("textbox", { name: "密码" }).fill(config.educoderPassword);
  await page.getByRole("button", { name: "登录" }).click();

  await page.getByRole("link", { name: "我的个人主页" }).click();

  const coursePagePromise = page.waitForEvent("popup");
  await page
    .getByText("数据结构与算法实验OUC----2026刘培顺隐藏130228180进行中")
    .click();
  const coursePage = await coursePagePromise;

  await coursePage.getByText("课堂实验").click();
  await coursePage.getByRole("link", { name: "必刷题" }).click();

  const problemPagePromise = coursePage.waitForEvent("popup");
  await coursePage
    .getByRole("complementary")
    .filter({ hasText: "开始学习" })
    .nth(5)
    .click();
  const problemPage = await problemPagePromise;

  await problemPage.waitForLoadState("domcontentloaded");
  await problemPage.waitForTimeout(3000);

  return problemPage;
}
