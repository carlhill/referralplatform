package au.com.referralplatform.fhirgateway.mhr;

import au.com.referralplatform.fhirgateway.mhr.dto.MhrDocumentBundle;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrUploadRequest;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrUploadResult;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/mhr")
public class MyHealthRecordController {

  private final MyHealthRecordService mhrService;

  public MyHealthRecordController(MyHealthRecordService mhrService) {
    this.mhrService = mhrService;
  }

  @GetMapping("/{ihi}/documents")
  public MhrDocumentBundle readDocuments(@PathVariable String ihi) throws MyHealthRecordUnavailableException {
    return mhrService.readDocuments(ihi);
  }

  @PostMapping("/documents")
  public MhrUploadResult uploadDocument(@Valid @RequestBody MhrUploadRequest request) throws MyHealthRecordUnavailableException {
    return mhrService.uploadDocument(request);
  }
}
