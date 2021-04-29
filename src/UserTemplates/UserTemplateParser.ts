import { App, FileSystemAdapter, TFile } from "obsidian";
import { exec } from "child_process";
import { promisify } from "util";

import TemplaterPlugin from "main";
import { ContextMode } from "TemplateParser";
import { TParser } from "TParser";
import { UNSUPPORTED_MOBILE_TEMPLATE } from "Constants";

export class UserTemplateParser extends TParser {
    private cwd: string;

    constructor(app: App, private plugin: TemplaterPlugin) {
        super(app);
        this.resolveCwd();        
    }

    resolveCwd() {
        // TODO: Add mobile support
        // @ts-ignore
        if (this.app.isMobile || !(this.app.vault.adapter instanceof FileSystemAdapter)) {
            this.cwd = "";
        }
        else {
            this.cwd = this.app.vault.adapter.getBasePath();
        }
    }

    async generateUserTemplates(file: TFile): Promise<Map<string, Function>> {
        const user_templates = new Map();
        const exec_promise = promisify(exec);

        const context = await this.plugin.templater.parser.generateContext(file, ContextMode.INTERNAL);

        for (let [template, cmd] of this.plugin.settings.templates_pairs) {
            if (template === "" || cmd === "") {
                continue;
            }

            // @ts-ignore
            if (this.app.isMobile) {
                user_templates.set(template, (user_args?: any): string => {
                    return UNSUPPORTED_MOBILE_TEMPLATE;
                })
            }
            else {
                cmd = await this.plugin.templater.parser.parseTemplates(cmd, context);

                user_templates.set(template, async (user_args?: any): Promise<string> => {
                    try {
                        const process_env = {
                            ...process.env,
                            ...user_args,
                        };

                        const cmd_options = {
                            timeout: this.plugin.settings.command_timeout * 1000,
                            cwd: this.cwd,
                            env: process_env,
                            ...(this.plugin.settings.shell_path !== "" && {shell: this.plugin.settings.shell_path}),
                        };

                        const {stdout} = await exec_promise(cmd, cmd_options);
                        return stdout.trimRight();
                    }
                    catch(error) {
                        this.plugin.log_error(`Error with User Template ${template}`, error);
                    }
                });
            }
        }

        return user_templates;
    }

    async generateContext(file: TFile) {
        const user_templates = this.plugin.settings.enable_system_commands ? await this.generateUserTemplates(file) : new Map();

        return {
            ...Object.fromEntries(user_templates),
        };
    }
}