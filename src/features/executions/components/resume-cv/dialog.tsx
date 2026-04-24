"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UploadIcon } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  operation: z.enum([
    "upload_resume",
    "select_resume",
    "auto_choose_by_role",
    "output_file",
    "analyze_resume",
  ]),
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only alphanumeric characters.",
    }),
  selectedResumeKey: z.enum(["frontend", "backend", "general"]),
  jobTitlePath: z.string().default("item.title"),
  resumes: z.array(
    z.object({
      key: z.enum(["frontend", "backend", "general"]),
      label: z.string().min(1),
      fileName: z.string().optional(),
      mimeType: z.string().optional(),
      base64: z.string().optional(),
    }),
  ),
});

type ResumeCvFormInputValues = z.input<typeof formSchema>;
export type ResumeCvFormValues = z.output<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ResumeCvFormValues) => void;
  defaultValues?: Partial<ResumeCvFormInputValues>;
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file."));
        return;
      }
      const base64 = result.includes(",")
        ? (result.split(",")[1] ?? "")
        : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function getDefaultResumes(defaultValues?: Partial<ResumeCvFormInputValues>) {
  const base = [
    {
      key: "frontend" as const,
      label: "Frontend Resume",
      fileName: "",
      mimeType: "",
      base64: "",
    },
    {
      key: "backend" as const,
      label: "Backend Resume",
      fileName: "",
      mimeType: "",
      base64: "",
    },
    {
      key: "general" as const,
      label: "General Resume",
      fileName: "",
      mimeType: "",
      base64: "",
    },
  ];

  const incoming = Array.isArray(defaultValues?.resumes)
    ? defaultValues.resumes
    : [];
  return base.map((item) => {
    const found = incoming.find((resume) => resume.key === item.key);
    return {
      ...item,
      label: found?.label ?? item.label,
      fileName: found?.fileName ?? "",
      mimeType: found?.mimeType ?? "",
      base64: found?.base64 ?? "",
    };
  });
}

export function ResumeCvDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<ResumeCvFormInputValues, unknown, ResumeCvFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      operation: defaultValues.operation ?? "auto_choose_by_role",
      variableName: defaultValues.variableName ?? "resumeFile",
      selectedResumeKey: defaultValues.selectedResumeKey ?? "general",
      jobTitlePath: defaultValues.jobTitlePath ?? "item.title",
      resumes: getDefaultResumes(defaultValues),
    },
  });

  const operation = form.watch("operation");
  const resumes = form.watch("resumes");
  const { fields } = useFieldArray({
    control: form.control,
    name: "resumes",
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      operation: defaultValues.operation ?? "auto_choose_by_role",
      variableName: defaultValues.variableName ?? "resumeFile",
      selectedResumeKey: defaultValues.selectedResumeKey ?? "general",
      jobTitlePath: defaultValues.jobTitlePath ?? "item.title",
      resumes: getDefaultResumes(defaultValues),
    });
  }, [defaultValues, form, open]);

  const handleUpload = async (file: File, index: number) => {
    if (
      !file.name.toLowerCase().endsWith(".pdf") &&
      !file.name.toLowerCase().endsWith(".docx")
    ) {
      toast.error("Only PDF and DOCX files are supported.");
      return;
    }

    const base64 = await fileToBase64(file);
    form.setValue(`resumes.${index}.fileName`, file.name);
    form.setValue(
      `resumes.${index}.mimeType`,
      file.type || "application/octet-stream",
    );
    form.setValue(`resumes.${index}.base64`, base64);
    toast.success(`${file.name} uploaded.`);
  };

  const handleSubmit = (values: ResumeCvFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,46rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Resume / CV</DialogTitle>
          <DialogDescription>
            Upload resumes and pick the right CV based on role.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="resume-cv-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-5 px-6 py-5"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="variableName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variable Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="resumeFile" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="operation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operation</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="upload_resume">
                            Upload Resume
                          </SelectItem>
                          <SelectItem value="select_resume">
                            Select Resume
                          </SelectItem>
                          <SelectItem value="auto_choose_by_role">
                            Auto Choose by Role
                          </SelectItem>
                          <SelectItem value="output_file">
                            Output File
                          </SelectItem>
                          <SelectItem value="analyze_resume">
                            Analyze Resume
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="selectedResumeKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selected Resume</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="frontend">
                          Frontend Resume
                        </SelectItem>
                        <SelectItem value="backend">Backend Resume</SelectItem>
                        <SelectItem value="general">General Resume</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Used for Select/Output operations and fallback behavior.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {operation === "auto_choose_by_role" ? (
                <FormField
                  control={form.control}
                  name="jobTitlePath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title Path</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="item.title or {{item.title}}"
                        />
                      </FormControl>
                      <FormDescription>
                        React/Frontend titles pick Frontend CV. Node/Backend
                        titles pick Backend CV.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">
                  Stored Resumes (PDF / DOCX)
                </p>
                {fields.map((item, index) => {
                  const fileName = resumes?.[index]?.fileName;
                  return (
                    <div
                      key={item.id}
                      className="rounded-md border bg-background p-3"
                    >
                      <p className="text-sm font-medium">{item.label}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            try {
                              await handleUpload(file, index);
                            } catch {
                              toast.error("Failed to process uploaded file.");
                            }
                          }}
                        />
                        <Button type="button" variant="outline" size="sm">
                          <UploadIcon className="size-4" />
                          Upload
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fileName
                          ? `Current: ${fileName}`
                          : "No file uploaded yet."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="resume-cv-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
